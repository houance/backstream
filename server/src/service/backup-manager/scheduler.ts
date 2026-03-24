import {
    backupTarget,
    execution,
    repository,
    setting,
    strategy,
    StrategyType,
    updateBackupStrategySchema, type UpdateBackupTargetSchema,
    updateBackupTargetSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    updateSettingSchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";
import {ResticService} from "./restic-service";
import PQueue from "p-queue";
import {desc, eq, inArray} from "drizzle-orm";
import {Cron} from "croner";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import { logger } from '../log/logger'
import {ResticError} from "../restic";

/**
 * Generates a randomized cron string (6 fields: s m h d M dw)
 * @param interval The frequency (e.g., every 5 units)
 * @param unit The time unit to apply the interval to
 */
function randomizedCron(
    interval: number, unit: 'sec' | 'minute' | 'hour' | 'day' | 'month' | 'year'
) {
    const rnd = (max: number) => Math.floor(Math.random() * max);
    // Default values (0 for small units, * for large units)
    let s: string = "0";
    let m: string = "0";
    let h: string = "0";
    let d: string = "*";
    let M: string = "*";
    const dw: string = "*";
    switch (unit) {
        case 'sec':
            s = `*/${interval}`;
            m = "*";
            h = "*";
            break;
        case 'minute':
            s = `${rnd(60)}`; // Randomize second
            m = `*/${interval}`;
            h = "*";
            break;
        case 'hour':
            s = `${rnd(60)}`; // Randomize second
            m = `${rnd(60)}`; // Randomize minute
            h = `*/${interval}`;
            break;
        case 'day':
            s = `${rnd(60)}`;
            m = `${rnd(60)}`;
            h = `${rnd(24)}`; // Randomize hour
            d = `*/${interval}`;
            break;
        case 'month':
            s = `${rnd(60)}`;
            m = `${rnd(60)}`;
            h = `${rnd(24)}`;
            d = `${1 + rnd(28)}`; // Randomize day (1-28 to be safe)
            M = `*/${interval}`;
            break;
        case 'year':
            s = `${rnd(60)}`;
            m = `${rnd(60)}`;
            h = `${rnd(24)}`;
            d = `${1 + rnd(28)}`;
            M = `${1 + rnd(12)}`; // Randomize month (1-12)
            break;
    }
    return `${s} ${m} ${h} ${d} ${M} ${dw}`;
}

async function getPolicyById(strategyId: number): Promise<Policy | null> {
    const result = await db.query.strategy.findFirst({
        where: (strategy, { eq }) => eq(strategy.id, strategyId),
        with: {
            targets: {
                with: {
                    repository: true,
                }
            }
        }
    });
    if (!result) return null;
    return result;
}

async function getAllPolicy() {
    return await db.query.strategy.findMany({
        with: {
            targets: {
                with: {
                    repository: true,
                }
            }
        }
    });
}

type AllPolicy = Awaited<ReturnType<typeof getAllPolicy>>;
type Policy = AllPolicy[number]
type Target = Policy["targets"][number];

function updateTargetNextRunAt(targetId: number) {
    // The outer function can stay async, but the callback MUST be sync
    return db.transaction((tx) => {
        // 1. Query target (Synchronous relational query)
        const result = tx.query.backupTarget.findFirst({
            where: (backupTarget, { eq }) => eq(backupTarget.id, targetId),
            with: {
                repository: true,
                strategy: true
            }
        }).sync();
        if (!result) return null;
        // 2. Calculate next run (Standard JS logic)
        const nextBackupTime = new Cron(result.schedulePolicy).nextRun()!.getTime();
        // 3. Update target (Use .run() instead of awaiting)
        tx.update(backupTarget)
            .set({ nextBackupAt: nextBackupTime })
            .where(eq(backupTarget.id, targetId))
            .run(); // .run() is synchronous for better-sqlite3
        return result;
    });
}


function updateRepoNextRunAt(repoId: number, type: 'check' | 'prune') {
    return db.transaction(tx => {
        // query repository
        const result = tx.query.repository.findFirst({
            where: (repository, { eq }) => eq(repository.id, repoId),
        }).sync();
        if (!result) return null;
        tx.update(repository)
            .set( type === 'check' ?
                { nextCheckAt: new Cron(result.checkSchedule).nextRun()!.getTime() } :
                { nextPruneAt: new Cron(result.pruneSchedule).nextRun()!.getTime() }
            )
            .where(eq(repository.id, repoId))
            .run();
        return result;
    })
}

// Discriminated Union for all kind of job
type JobMetadata =
    | { category: 'repo'; type: 'check' | 'prune' | 'stat' | 'snapshots' | 'heartbeat'; repoId: number; }
    | { category: 'policy-target'; type: 'backup' | 'copy'; strategyId: number; targetId: number; repoId: number; }
    | { category: 'policy'; type: 'datasize'; strategyId: number }
    | { category: 'system'; type: 'clean' };

// Error type if create/update record fail
type InitError = {
    error: any;
    message: string;
}

// Type Alias combine metadata with the Cron instance
type JobRecord =
    | ( JobMetadata & { cron: Cron } & { status: 'active'; key: string })
    | ( JobMetadata & InitError & { status: 'error'; key: string })

// Type Alias combine repo with error
type ClientRecord =
    | { client: ResticService; status: 'active'; key: string }
    | ( InitError & { status: 'error'; key: string })

const getJobKey = (meta: JobMetadata): string => {
    switch (meta.category) {
        case 'repo':
            // Format: repo:123:check
            return `repo:${meta.repoId}:${meta.type}`;
        case 'policy-target':
            // Format: policy:10:target:12
            return `policy:${meta.strategyId}:target:${meta.targetId}`;
        case 'policy':
            // Format: policy:5:datasize
            return `policy:${meta.strategyId}:datasize`;
        case 'system':
            return `system:${meta.type}`;
        default:
            return 'unknown';
    }
};

const random = (max: number) => Math.floor(Math.random() * max);

export class Scheduler {
    private readonly clientMap: Map<string, ClientRecord>;
    private readonly cronJobMap: Map<string, JobRecord>;
    private readonly globalQueue: PQueue;

    private constructor(globalQueue: PQueue) {
        this.clientMap = new Map();
        this.cronJobMap = new Map();
        this.globalQueue = globalQueue;
    }

    public static async create(concurrency: number = 5): Promise<Scheduler> {
        // create scheduler
        const scheduler = new Scheduler(new PQueue({ concurrency }));
        // set all running execution to fail
        await db.update(execution)
            .set({ executeStatus: "fail", finishedAt: Date.now() })
            .where(eq(execution.executeStatus, "running"));
        // delete all pending execution for reschedule
        await db.delete(execution).where(eq(execution.executeStatus, "pending"));
        // get all repo from db
        const allRepo = await db.select().from(repository);
        if (!allRepo) throw new Error("get all repo failed");
        // init ResticService from all repo
        allRepo.forEach(repository => {
            // convert to validate zod schema
            const validated = updateRepositorySchema.parse(repository);
            // add client to schedule
            scheduler.addResticService(validated);
        })
        // init policy schedule
        const allPolicy = await getAllPolicy();
        allPolicy.forEach(policy => scheduler.addPolicySchedule(policy))
        // init system schedule
        void scheduler.addTmpFolderCleanSchedule();
        return scheduler;
    }

    public async addResticService(repo: UpdateRepositorySchema) {
        const key = repo.id.toString();
        if (this.clientMap.has(key)) {
            const stopResult = await this.stopResticService(repo);
            if (stopResult.length > 0) this.clientMap.set(key, {
                error: stopResult,
                message: `stop ResticService ${repo.name} fail: ${stopResult} still running`,
                status: 'error',
                key: key
            })
        }
        const createResult = await ResticService.create(repo, this.globalQueue);
        if (createResult instanceof ResticError) {
            this.clientMap.set(key, {
                error: createResult,
                message: `create ResticService ${repo.name} fail: ${createResult.toString()}`,
                status: 'error',
                key: key
            });
            return createResult.toString();
        }
        this.clientMap.set(key, {
            client: createResult,
            status: 'active',
            key: key
        });
        // add repo schedule
        void this.addRepoMaintainSchedule(repo);
    }

    public async getResticService(repo: UpdateRepositorySchema) {
        const key = repo.id.toString();
        if (!this.clientMap.has(key)) {
            await this.addResticService(repo);
        }
        return this.clientMap.get(key)!;
    }

    private async getRunningPolicyByRepo(repo: UpdateRepositorySchema): Promise<string[]> {
        const strategyIds: number[] = [];
        this.cronJobMap.forEach((job) => {
            if (job.status === 'active' && job.category === 'policy-target' && job.repoId === repo.id) {
                strategyIds.push(job.strategyId)
            }
        })
        if (strategyIds.length === 0) return [];
        const strategies = await db.select().from(strategy)
            .where(inArray(strategy.id, strategyIds))
        if (strategies.length === 0) return [];
        return strategies.map(strategy => strategy.name);
    }

    public async stopResticService(repo: UpdateRepositorySchema): Promise<string[]> {
        // 检查是否还有运行的 policy
        const strategyNames = await this.getRunningPolicyByRepo(repo);
        if (strategyNames.length !== 0) return strategyNames;
        // 停止并删除所有 repo job
        this.cronJobMap.forEach((job, key) => {
            if (job.category === 'repo') {
                if (job.status === 'active') job.cron.stop();
                this.cronJobMap.delete(key);
            }
        });
        // 停止 restic service 所有任务
        const clientRecord = this.clientMap.get(repo.id.toString());
        if (!clientRecord) return [];
        if (clientRecord.status === 'active') clientRecord.client.stopAllRunningJob();
        this.clientMap.delete(repo.id.toString());
        return [];
    }

    public async stopPolicy(strategyId: number): Promise<{ status: 'success' | 'Not found' }> {
        const dbResult = await getPolicyById(strategyId);
        if (!dbResult) return { status: 'Not found' };
        // stop policy and policy-target job
        this.cronJobMap.forEach((job, key) => {
            if (job.category === 'policy' || job.category === 'policy-target') {
                if (job.status === 'active') job.cron.stop();
                this.cronJobMap.delete(key);
            }
            if (job.category === 'policy-target') {
                const clientRecord = this.clientMap.get(job.repoId.toString());
                if (clientRecord && clientRecord.status === 'active') {
                    clientRecord.client.stopPolicyJob(job.targetId);
                }
            }
        });
        return { status: 'success' };
    }

    private createRepoJobMeta(
        repoId: number,
        type: 'check' | 'prune' | 'stat' | 'snapshots' | 'heartbeat'
    ) {
        const job = {
            category: 'repo',
            type: type,
            repoId: repoId
        } as const;
        const key = getJobKey(job);
        const previousJob = this.cronJobMap.get(key);
        if (previousJob && previousJob.status === 'active') previousJob.cron.stop();
        return { job, key }
    }

    private async addRepoMaintainSchedule(repo: UpdateRepositorySchema) {
        // create check job
        if (repo.checkSchedule !== 'manual') {
            const { job, key } = this.createRepoJobMeta(repo.id, 'check');
            const cron = new Cron(repo.checkSchedule, { protect: true }, async () => {
                const dbResult = updateRepoNextRunAt(repo.id, 'check');
                if (!dbResult) {
                    logger.error(`update repo ${repo.id} nextCheckAt fail`);
                    return;
                }
                // get rs
                const validRepo = updateRepositorySchema.parse(dbResult);
                const rs = await this.getResticService(validRepo);
                if (rs.status === 'active') await rs.client.check();
            });
            this.cronJobMap.set(key, {
                ...job,
                cron,
                key,
                status: 'active',
            })
        }
        // create prune job
        if (repo.pruneSchedule !== 'manual') {
            const { job, key } = this.createRepoJobMeta(repo.id, 'check');
            const cron = new Cron(repo.pruneSchedule, { protect: true }, async () => {
                const dbResult = updateRepoNextRunAt(repo.id, 'prune');
                if (!dbResult) {
                    logger.error(`update repo ${repo.id} nextPruneAt fail`);
                    return;
                }
                // get rs
                const validRepo = updateRepositorySchema.parse(dbResult);
                const rs = await this.getResticService(validRepo);
                if (rs.status === 'active') await rs.client.prune();
            });
            this.cronJobMap.set(key, {
                ...job,
                cron,
                key,
                status: 'active',
            })
        }
        // heartbeat
        const { job, key } = this.createRepoJobMeta(repo.id, 'heartbeat');
        const cron = new Cron(randomizedCron(5, 'minute'), { protect: true }, async () => {
            const [dbResult] = await db.select().from(repository)
                .where(eq(repository.id, repo.id));
            if (!dbResult) {
                logger.error(`get repo ${repo.id} for heartbeat job fail`);
                return;
            }
            // get rs
            const validRepo = updateRepositorySchema.parse(dbResult);
            const rs = await this.getResticService(validRepo);
            if (rs.status === 'active') await rs.client.heartbeat();
        });
        this.cronJobMap.set(key, {
            ...job,
            cron,
            key,
            status: 'active',
        })
        // run heartbeat immediately
        void cron.trigger();
        // fetch repo stats job
        const { job: statJob, key: statJobKey } = this.createRepoJobMeta(repo.id, 'stat');
        const statCron = new Cron(randomizedCron(12, 'hour'), { protect: true }, async () => {
            const [dbResult] = await db.select().from(repository)
                .where(eq(repository.id, repo.id));
            if (!dbResult) {
                logger.error(`get repo ${repo.id} for stats job fail`);
                return;
            }
            // get rs
            const validRepo = updateRepositorySchema.parse(dbResult);
            const rs = await this.getResticService(validRepo);
            if (rs.status === 'active') await rs.client.updateRepoStat();
        })
        this.cronJobMap.set(key, {
            ...statJob,
            cron: statCron,
            key: statJobKey,
            status: 'active',
        })
        // run stat immediately
        void statCron.trigger();
        // index snapshots job
        const { job: indexJob, key: indexJobKey } = this.createRepoJobMeta(repo.id, 'snapshots');
        const indexCron = new Cron(randomizedCron(1, "hour"), { protect: true }, async () => {
            const [dbResult] = await db.select().from(repository)
                .where(eq(repository.id, repo.id));
            if (!dbResult) {
                logger.error(`get repo ${repo.id} for snapshots job fail`);
                return;
            }
            // get rs
            const validRepo = updateRepositorySchema.parse(dbResult);
            const rs = await this.getResticService(validRepo);
            if (rs.status === 'active') await rs.client.indexSnapshots();
        });
        this.cronJobMap.set(key, {
            ...indexJob,
            cron: indexCron,
            key: indexJobKey,
            status: 'active',
        })
        // run index immediately
        void indexCron.trigger();
    }

    private addDataSizeUpdate(policy: Policy) {
        const strategyId = policy.id;
        const job = {
            category: 'policy',
            type: 'datasize',
            strategyId: strategyId,
        } as const;
        const key = getJobKey(job);
        // stop previous job
        const previousJob = this.cronJobMap.get(key);
        if (previousJob && previousJob.status === 'active') previousJob.cron.stop();
        const cron = new Cron(randomizedCron(1, 'day'), { protect: true }, async () => {
            const rc = new RcloneClient(); // local rclone
            const sizeResult = await rc.getSize(policy.dataSource);
            const size = sizeResult.success ? sizeResult.result.bytes : policy.dataSourceSize;
            await db.update(strategy).set({ dataSourceSize: size }).where(eq(strategy.id, policy.id));
        });
        const jobRecord = {
            ...job,
            cron,
            key,
            status: 'active',
        } as const;
        this.cronJobMap.set(key, jobRecord);
        // run data size update immediately
        void cron.trigger();
    }

    public async addPolicyScheduleByStrategyId(strategyId: number) {
        const policy = await getPolicyById(strategyId);
        if (policy === null) return;
        this.addPolicySchedule(policy);
    }

    public addPolicySchedule(policy: Policy) {
        const targets = policy.targets.sort((a, b) => a.index - b.index);
        const validateStrategy = updateBackupStrategySchema.parse(policy);
        switch (validateStrategy.strategyType) {
            case StrategyType.MULTI_VERSION_BACKUP:
                this.scheduleVersioningBackup(
                    policy,
                    targets[0]
                );
                break;
            case StrategyType.STRATEGY_321:
                // local backup, first target
                this.scheduleVersioningBackup(
                    policy,
                    targets[0]
                )
                // remote sync, second target
                this.scheduleLocalSyncBackup(
                    policy,
                    targets[0],
                    targets[1]
                )
                break;
        }
        // add strategy datasource size update
        this.addDataSizeUpdate(policy);
    }

    private async createTargetJobMeta(strategyId: number, target: Target, type: 'backup' | 'copy') {
        const targetId = target.id;
        const job = {
            category: 'policy-target',
            type: type,
            strategyId: strategyId,
            targetId: targetId,
            repoId: target.repositoryId
        } as const;
        const key = getJobKey(job);
        // stop previous job
        const previousJob = this.cronJobMap.get(key);
        if (previousJob && previousJob.status === 'active') {
            previousJob.cron.stop();
        }
        // stop previous policy-target running task
        const validRepo = updateRepositorySchema.parse(target.repository);
        const clientRecord = await this.getResticService(validRepo);
        if (clientRecord && clientRecord.status === 'active') {
            clientRecord.client.stopPolicyJob(targetId);
        }
        return {job, key};
    }

    private async scheduleVersioningBackup(policy: Policy, target: Target) {
        const {job, key} = await this.createTargetJobMeta(
            policy.id,
            target,
            'backup'
        );
        const cron = new Cron(target.schedulePolicy, { protect: true }, async () => {
            // update target nextRunAt
            const result = updateTargetNextRunAt(target.id);
            if (!result) {
                logger.warn(`update target ${target.id} nextRunAt failed `);
                return;
            }
            const validRepo = updateRepositorySchema.parse(result.repository);
            const clientRecord = await this.getResticService(validRepo);
            const validTarget = updateBackupTargetSchema.parse(result);
            if (clientRecord.status === 'active') await clientRecord.client.backup(result.strategy.dataSource, validTarget);
        });
        const jobRecord = {
            ...job,
            cron,
            key,
            status: 'active',
        } as const;
        this.cronJobMap.set(key, jobRecord);
    }

    private async scheduleLocalSyncBackup(policy: Policy, local: Target, remote: Target) {
        const {job, key} = await this.createTargetJobMeta(
            policy.id,
            remote,
            'copy'
        );
        const cron = new Cron(remote.schedulePolicy, { protect: true }, async () => {
            // update remote nextRunAt
            const result = updateTargetNextRunAt(remote.id);
            if (!result) {
                logger.warn(`update target ${remote.id} nextRunAt failed `);
                return;
            }
            // get local target
            const localTarget = await db.query.backupTarget.findFirst({
                where: (backupTarget, { eq }) => eq(backupTarget.id, local.id),
                with: {
                    repository: true
                }
            });
            if (!localTarget) {
                logger.error(`find local target ${local.id} fail`);
                return;
            }
            const localValidRepo = updateRepositorySchema.parse(localTarget.repository);
            const localClientRecord = await this.getResticService(localValidRepo);
            if (!localClientRecord) {
                logger.error(`find local target ${local.id} fail`);
                return;
            }
            const remoteValidRepo = updateRepositorySchema.parse(result.repository);
            const remoteClientRecord = await this.getResticService(remoteValidRepo);
            const remoteValidTarget = updateBackupTargetSchema.parse(result);
            if (localClientRecord.status === 'active' && remoteClientRecord.status === 'active') {
                await localClientRecord.client.copyTo(policy.dataSource, remoteClientRecord.client, remoteValidTarget);
            }
        });
        const jobRecord = {
            ...job,
            cron,
            key,
            status: 'active',
        } as const;
        this.cronJobMap.set(key, jobRecord);
    }

    private async addTmpFolderCleanSchedule() {
        const datasizeUpdateSchedule = '13 21 4 * * *';
        const job = {
            category: 'system',
            type: 'clean'
        } as const;
        const key = getJobKey(job);
        // stop previous job
        const previousJob = this.cronJobMap.get(key);
        if (previousJob && previousJob.status === 'active') previousJob.cron.stop();
        const cron = new Cron(datasizeUpdateSchedule, { protect: true }, async () => {
            const [systemSettings] = await db.select().from(setting)
                .orderBy(desc(setting.id))
                .limit(1);
            if (!systemSettings) {
                logger.error(`get system setting failed.`);
                return;
            }
            const errors = await FileManager.clearTmpFolder(systemSettings.logRetentionDays);
            if (errors.length > 0) {
                logger.warn(`clean tmp folder fail.\n` + errors.join('\n'));
            } else {
                logger.debug(`clean tmp folder success.`);
            }});
        const jobRecord = {
            ...job,
            cron,
            key,
            status: 'active',
        } as const;
        this.cronJobMap.set(key, jobRecord);
    }
}