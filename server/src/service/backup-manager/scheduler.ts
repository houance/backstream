import {
    backupTarget,
    execution,
    repository,
    setting, strategy, StrategyType, updateBackupStrategySchema, updateBackupTargetSchema,
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

export class Scheduler {
    private readonly clientMap: Map<number, ResticService>; // <repoId, ResticService>
    private readonly setting: UpdateSystemSettingSchema
    private readonly globalQueue: PQueue; // all working job
    private readonly repoCronJob: Map<string, Cron> // <repoId:check/prune/heartbeat/snapshots, Cron>
    private readonly policyCronJob: Map<string, Cron> // <strategyId:backupTargetId:repoId, Cron>

    private constructor(setting: UpdateSystemSettingSchema, globalQueue: PQueue) {
        this.clientMap = new Map<number, ResticService>();
        this.repoCronJob = new Map();
        this.policyCronJob = new Map();
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
        return scheduler;
    }

    public async addResticService(repo: UpdateRepositorySchema) {
        if (this.clientMap.has(repo.id)) return;
        const resticService = await ResticService.create(repo, this.globalQueue);
        this.clientMap.set(repo.id, resticService);
        // add repo schedule
        await this.addRepoHeartBeatSchedule(resticService);
        await this.addSnapshotIndexSchedule(resticService);
        await this.addRepoMaintainSchedule(resticService);
    }

    public async getResticService(repository: UpdateRepositorySchema) {
        if (!this.clientMap.has(repository.id)) {
            await this.addResticService(repository);
        }
        return this.clientMap.get(repository.id)!;
    }

    private async getRunningPolicyByRepo(repo: UpdateRepositorySchema): Promise<string[]> {
        const strategyIds: number[] = [];
        for (const [key, value] of this.policyCronJob) {
            const ids = key.split(":");
            if (ids[2] === repo.id.toString()) strategyIds.push(Number(ids[0]));
        }
        if (strategyIds.length === 0) return [];
        const strategies = await db.select().from(strategy)
            .where(inArray(strategy.id, strategyIds))
        if (strategies.length === 0) return [];
        return strategies.map(strategy => strategy.name);
    }

    public async deleteResticService(repo: UpdateRepositorySchema): Promise<string[]> {
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
        await rs.stopAllRunningJob();
        this.clientMap.delete(repo.id);
        return [];
    }

    private async addRepoMaintainSchedule(resticService: ResticService) {
        const checkSchedule = resticService.repo.checkSchedule;
        const pruneSchedule = resticService.repo.pruneSchedule;
        const repoId = resticService.repo.id;
        const checkJobKey = `${repoId}:check`
        const pruneJobKey = `${repoId}:prune`
        if (checkSchedule !== "manual" && !this.repoCronJob.has(checkJobKey)) {
            this.repoCronJob.set(checkJobKey, new Cron(checkSchedule, { protect: true }, async () => {
                await resticService.check()
                await db.update(repository)
                    .set({ nextCheckAt: new Cron(checkSchedule).nextRun()!.getTime() })
                    .where(eq(repository.id, repoId))
            }))
        }
        if (pruneSchedule !== "manual" && !this.repoCronJob.has(pruneJobKey)) {
            this.repoCronJob.set(pruneJobKey, new Cron(pruneSchedule, { protect: true }, async () => {
                await resticService.prune()
                await db.update(repository)
                    .set({ nextPruneAt: new Cron(pruneSchedule).nextRun()!.getTime() })
                    .where(eq(repository.id, repoId))
            }))
        }
    }

    private async addRepoHeartBeatSchedule(resticService: ResticService) {
        const heartbeatJobKey = `${resticService.repo.id}:heartbeat`
        if (this.repoCronJob.has(heartbeatJobKey)) return;
        const job = new Cron("*/30 * * * * *", { protect: true }, async () => {
            await resticService.isConnected()
        })
        await job.trigger();
        this.repoCronJob.set(heartbeatJobKey, job)
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
    }

    private scheduleLocalBackupStrategy(policy: Policy) {
        policy.targets.forEach(target => {
            if (target.index !== 1) {
                return;
            }
            const cronJobKey = `${policy.id}:${target.id}:${target.repositoryId}`
            if (this.policyCronJob.has(cronJobKey)) return;
            const validRepo = updateRepositorySchema.parse(target.repository);
            this.policyCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                const resticService = await this.getResticService(validRepo);
                const validatedTarget = updateBackupTargetSchema.parse(target);
                await resticService.backup(policy.dataSource, validatedTarget);
                // 更新下一次运行时间
                await db.update(backupTarget)
                    .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                    .where(eq(backupTarget.id, target.id));
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
            if (this.policyCronJob.has(cronJobKey)) continue;
            if (target.index === 1) {
                this.policyCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    await localResticService.backup(policy.dataSource, localBackupTarget);
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                }))
            }
            if ([2, 3].includes(target.index)) {
                this.policyCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    const targetResticService = await this.getResticService(updateRepositorySchema.parse(target.repository));
                    await localResticService.copyTo(policy.dataSource, targetResticService, updateBackupTargetSchema.parse(target));
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                }))
            }
        }
    }

    public async addSnapshotIndexSchedule(resticService: ResticService) {
        const cronJobKey = `${resticService.repo.id}:snapshots`;
        if (this.repoCronJob.has(cronJobKey)) return;
        const job = new Cron("0 */5 * * * *", { protect: true }, async () => {
            await resticService.indexSnapshots();
        })
        this.repoCronJob.set(cronJobKey, job);
        // run index snapshot IMMEDIATELY
        void job.trigger();
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