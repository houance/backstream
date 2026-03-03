import {
    backupTarget,
    execution,
    repository,
    setting,
    strategy,
    StrategyType,
    updateBackupStrategySchema,
    updateBackupTargetSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    updateSettingSchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";
import {ResticService} from "./restic-service";
import PQueue from "p-queue";
import {eq, inArray} from "drizzle-orm";
import {Cron} from "croner";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import { logger } from '../log/logger'

export class Scheduler {
    private readonly clientMap: Map<number, ResticService>; // <repoId, ResticService>
    private readonly setting: UpdateSystemSettingSchema
    private readonly globalQueue: PQueue; // all working job
    private readonly repoCronJob: Map<string, Cron> // <repoId:check/prune/stat/snapshots, Cron>
    private readonly targetCronJob: Map<string, Cron> // <strategyId:backupTargetId:repoId, Cron>
    private readonly dataSizeCronJob: Map<number, Cron> // <strategyId, Cron>
    private readonly systemCronJob: Map<string, Cron>; // <clean/xxx, Cron>

    private constructor(setting: UpdateSystemSettingSchema, globalQueue: PQueue) {
        this.clientMap = new Map();
        this.repoCronJob = new Map();
        this.targetCronJob = new Map();
        this.dataSizeCronJob = new Map();
        this.systemCronJob = new Map();
        this.setting = setting;
        this.globalQueue = globalQueue;
    }

    public static async create(concurrency: number = 5): Promise<Scheduler> {
        // init queue
        const globalQueue = new PQueue({ concurrency });
        // get setting from db
        const systemSetting = await db.select().from(setting).orderBy(setting.id).limit(1)
        if (!systemSetting) throw new Error("get setting failed");
        const validateSetting = updateSettingSchema.parse(systemSetting[0]);
        // create scheduler
        const scheduler = new Scheduler(validateSetting, globalQueue);
        // set all running execution to fail
        await db.update(execution)
            .set({ executeStatus: "fail", finishedAt: Date.now() })
            .where(eq(execution.executeStatus, "running"));
        // delete all pending execution for reschedule
        await db.delete(execution).where(eq(execution.executeStatus, "pending"));
        // get all repo from db
        const allRepo = await db.select().from(repository);
        if (!allRepo) throw new Error("get all repo failed");
        // init client from all repo
        allRepo.forEach(repository => {
            // convert to validate zod schema
            const validated = updateRepositorySchema.parse(repository);
            // add client to schedule
            scheduler.addResticService(validated);
        })
        // init policy schedule
        const allPolicy = await getAllPolicy();
        allPolicy.forEach(policy => scheduler.addPolicySchedule(policy))
        // start system schedule
        void scheduler.addTmpFolderCleanSchedule();
        return scheduler;
    }

    public async addResticService(repo: UpdateRepositorySchema) {
        if (this.clientMap.has(repo.id)) return;
        const resticService = await ResticService.create(repo, this.globalQueue);
        this.clientMap.set(repo.id, resticService);
        // add repo schedule
        await this.addRepoMaintainSchedule(resticService);
        await this.addRepoIndexSchedule(resticService);
    }

    public async getResticService(repository: UpdateRepositorySchema) {
        if (!this.clientMap.has(repository.id)) {
            await this.addResticService(repository);
        }
        return this.clientMap.get(repository.id)!;
    }

    private async getRunningPolicyByRepo(repo: UpdateRepositorySchema): Promise<string[]> {
        const strategyIds: number[] = [];
        for (const [key, _value] of this.targetCronJob) {
            const ids = key.split(":");
            if (ids[2] === repo.id.toString()) strategyIds.push(Number(ids[0]));
        }
        if (strategyIds.length === 0) return [];
        const strategies = await db.select().from(strategy)
            .where(inArray(strategy.id, strategyIds))
        if (strategies.length === 0) return [];
        return strategies.map(strategy => strategy.name);
    }

    public async stopResticService(repo: UpdateRepositorySchema): Promise<string[]> {
        const strategyNames = await this.getRunningPolicyByRepo(repo);
        if (strategyNames.length !== 0) return strategyNames;
        // 停止并删除 cron job
        for (const [key, value] of this.repoCronJob) {
            const repoId = key.split(":")[0];
            if (repoId === repo.id.toString()) {
                value.stop();
                this.repoCronJob.delete(key);
            }
        }
        // 停止 restic service 所有任务
        const rs = this.clientMap.get(repo.id);
        if (!rs) return [];
        rs.stopAllRunningJob();
        this.clientMap.delete(repo.id);
        return [];
    }

    public async stopPolicy(strategyId: number): Promise<{ status: 'success' | 'Not found' }> {
        const dbResult = await getPolicyById(strategyId);
        if (!dbResult) return { status: 'Not found' };
        // 停止 datasource 更新
        const dataSizeCronJob = this.dataSizeCronJob.get(strategyId);
        if (dataSizeCronJob) {
            dataSizeCronJob.stop();
            this.dataSizeCronJob.delete(strategyId);
        }
        for (const target of dbResult.targets) {
            // 停止 target 调度
            const cronJobKey = `${strategyId}:${target.id}:${target.repositoryId}`;
            this.targetCronJob.get(cronJobKey)?.stop();
            this.targetCronJob.delete(cronJobKey);
            // 停止 target 正在运行的任务
            const rs = this.clientMap.get(target.repositoryId);
            if (!rs) continue;
            await rs.stopPolicyRunningJob(target.id);
        }
        return { status: 'success' };
    }

    private async addRepoMaintainSchedule(resticService: ResticService) {
        const repoId = resticService.repo.id;
        // check schedule
        const checkSchedule = resticService.repo.checkSchedule;
        const checkJobKey = `${repoId}:check`
        if (checkSchedule !== "manual" && !this.repoCronJob.has(checkJobKey)) {
            this.repoCronJob.set(checkJobKey, new Cron(checkSchedule, { protect: true }, async () => {
                await db.update(repository)
                    .set({ nextCheckAt: new Cron(checkSchedule).nextRun()!.getTime() })
                    .where(eq(repository.id, repoId))
                await resticService.check();
            }))
        }
        // prune schedule
        const pruneSchedule = resticService.repo.pruneSchedule;
        const pruneJobKey = `${repoId}:prune`
        if (pruneSchedule !== "manual" && !this.repoCronJob.has(pruneJobKey)) {
            this.repoCronJob.set(pruneJobKey, new Cron(pruneSchedule, { protect: true }, async () => {
                await db.update(repository)
                    .set({ nextPruneAt: new Cron(pruneSchedule).nextRun()!.getTime() })
                    .where(eq(repository.id, repoId));
                await resticService.prune();
            }))
        }
        // stat(repo status, usage, capacity) schedule
        const cronJobKey = `${repoId}:stat`
        if (this.repoCronJob.has(cronJobKey)) return;
        const repoStatJob = new Cron("25 */2 * * * *", { protect: true }, async () => {
            await resticService.updateStat()
        })
        void repoStatJob.trigger();
        this.repoCronJob.set(cronJobKey, repoStatJob)
    }

    public async addRepoIndexSchedule(resticService: ResticService) {
        const cronJobKey = `${resticService.repo.id}:snapshots`;
        if (this.repoCronJob.has(cronJobKey)) return;
        const job = new Cron("5 */5 * * * *", { protect: true }, async () => {
            await resticService.indexSnapshots();
        })
        this.repoCronJob.set(cronJobKey, job);
        // run index snapshot IMMEDIATELY
        void job.trigger();
    }

    private addDatasourceSizeUpdate(policy: Policy) {
        const cronJobKey = policy.id;
        if (this.dataSizeCronJob.has(cronJobKey)) return;
        this.dataSizeCronJob.set(cronJobKey, new Cron('15 */5 * * * *', { protect: true }, async () => {
            const rc = new RcloneClient(); // local rclone
            const sizeResult = await rc.getSize(policy.dataSource);
            const size = sizeResult.success ? sizeResult.result.bytes : policy.dataSourceSize;
            await db.update(strategy).set({ dataSourceSize: size }).where(eq(strategy.id, policy.id));
        }))
    }

    public async addPolicyScheduleByStrategyId(strategyId: number) {
        const policy = await getPolicyById(strategyId);
        if (policy === null) return;
        this.addPolicySchedule(policy);
    }

    public addPolicySchedule(policy: Policy) {
        const validateStrategy = updateBackupStrategySchema.parse(policy);
        switch (validateStrategy.strategyType) {
            case StrategyType.LOCAL_BACKUP:
                this.scheduleLocalBackupStrategy(policy);
                break;
            case StrategyType.STRATEGY_321:
                void this.schedule321BackupStrategy(policy);
                break;
        }
        // add strategy datasource size update
        this.addDatasourceSizeUpdate(policy);
    }

    private scheduleLocalBackupStrategy(policy: Policy) {
        policy.targets.forEach(target => {
            if (target.index !== 1) {
                return;
            }
            const cronJobKey = `${policy.id}:${target.id}:${target.repositoryId}`
            if (this.targetCronJob.has(cronJobKey)) return;
            const validRepo = updateRepositorySchema.parse(target.repository);
            this.targetCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                // 更新下一次运行时间
                await db.update(backupTarget)
                    .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                    .where(eq(backupTarget.id, target.id));
                const resticService = await this.getResticService(validRepo);
                const validatedTarget = updateBackupTargetSchema.parse(target);
                await resticService.backup(policy.dataSource, validatedTarget);
            }))
        })
    }

    private async schedule321BackupStrategy(policy: Policy) {
        // asc by target index, 1 is local, 2/3 is remote
        const targets = policy.targets.sort((a, b) => a.index - b.index);
        const localValidateRepo = updateRepositorySchema.parse(targets[0].repository);
        const localResticService = await this.getResticService(localValidateRepo);
        const localBackupTarget = updateBackupTargetSchema.parse(targets[0]);
        // 创建 cron job
        for (const target of targets) {
            const cronJobKey = `${policy.id}:${target.id}:${target.repositoryId}`;
            if (this.targetCronJob.has(cronJobKey)) continue;
            if (target.index === 1) {
                this.targetCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                    await localResticService.backup(policy.dataSource, localBackupTarget);
                }))
            }
            if ([2, 3].includes(target.index)) {
                this.targetCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                    const targetResticService = await this.getResticService(updateRepositorySchema.parse(target.repository));
                    await localResticService.copyTo(policy.dataSource, targetResticService, updateBackupTargetSchema.parse(target));
                }))
            }
        }
    }

    private async addTmpFolderCleanSchedule() {
        const cronJobKey = `clean`;
        if (this.systemCronJob.has(cronJobKey)) return;
        this.systemCronJob.set(cronJobKey, new Cron('13 21 4 * * *', { protect: true }, async () => {
            const logRetentionDays = this.setting.logRetentionDays;
            const errors = await FileManager.clearTmpFolder(logRetentionDays);
            if (errors.length > 0) {
                logger.warn(`clean tmp folder fail.\n` + errors.join('\n'));
            } else {
                logger.debug(`clean tmp folder success.`);
            }
        }))
    }
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