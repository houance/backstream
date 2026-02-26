import {
    backupTarget,
    execution,
    repository,
    setting, StrategyType, updateBackupStrategySchema, updateBackupTargetSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    updateSettingSchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";
import {ResticService} from "./restic-service";
import PQueue from "p-queue";
import {eq} from "drizzle-orm";
import {Cron} from "croner";

export class Scheduler {
    private readonly clientMap: Map<number, ResticService>;
    private readonly setting: UpdateSystemSettingSchema
    private readonly globalQueue: PQueue; // all working job
    private readonly repoCronJob: Map<string, Cron> // <repoId:check/prune/heartbeat/snapshots, Cron>
    private readonly policyCronJob: Map<string, Cron> // <strategyId:backupTargetId, Cron>

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
        return scheduler;
    }

    public async addResticService(repo: UpdateRepositorySchema) {
        if (this.clientMap.has(repo.id)) return;
        const resticService = new ResticService(repo, this.globalQueue);
        this.clientMap.set(repo.id, resticService);
        // add schedule
        void this.addRepoHeartBeatSchedule(resticService);
        void this.addRepoMaintainSchedule(resticService);
        void this.addSnapshotIndexSchedule(resticService);
        const allPolicy = await getAllPolicy();
        allPolicy.forEach(policy => this.addPolicySchedule(policy))
    }

    public async getResticService(repository: UpdateRepositorySchema) {
        if (!this.clientMap.has(repository.id)) {
            await this.addResticService(repository);
        }
        return this.clientMap.get(repository.id)!;
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
        this.repoCronJob.set(heartbeatJobKey, new Cron("*/15 * * * * *", { protect: true }, async () => {
            await resticService.isConnected()
        }))
    }

    public addPolicySchedule(policy: Policy) {
        const validateStrategy = updateBackupStrategySchema.parse(policy);
        switch (validateStrategy.strategyType) {
            case 'LOCAL_BACKUP':
                this.scheduleLocalBackupStrategy(policy);
                break;
            case 'STRATEGY_321':
                this.schedule321BackupStrategy(policy);
                break;
        }
    }

    private scheduleLocalBackupStrategy(policy: Policy) {
        policy.targets.forEach(target => {
            if (target.index !== 1) {
                return;
            }
            const cronJobKey = `${policy.id}:${target.id}`
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

    private schedule321BackupStrategy(policy: Policy) {
        let localResticService: ResticService;
        // asc by target index, 1 is local, 2/3 is remote
        policy.targets.sort((a, b) => a.index - b.index).forEach(async target => {
            const cronJobKey = `${policy.id}:${target.id}`;
            if (this.policyCronJob.has(cronJobKey)) return;
            const targetValidRepo = updateRepositorySchema.parse(target.repository);
            const targetResticService = await this.getResticService(targetValidRepo);
            const validatedTarget = updateBackupTargetSchema.parse(target);
            if (target.index === 1) {
                localResticService = targetResticService;
                this.policyCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    await localResticService.backup(policy.dataSource, validatedTarget);
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                }))
            }
            if ([2, 3].includes(target.index) && localResticService !== undefined) {
                this.policyCronJob.set(cronJobKey, new Cron(target.schedulePolicy, { protect: true }, async () => {
                    await localResticService.copyTo(policy.dataSource, targetResticService, validatedTarget);
                    // 更新下一次运行时间
                    await db.update(backupTarget)
                        .set({ nextBackupAt: new Cron(target.schedulePolicy).nextRun()!.getTime() })
                        .where(eq(backupTarget.id, target.id));
                }))
            }
        })
    }

    public async addSnapshotIndexSchedule(resticService: ResticService) {
        const cronJobKey = `${resticService.repo.id}:snapshots`;
        this.repoCronJob.set(cronJobKey, new Cron("*/30 * * * * *", { protect: true }, async () => {
            await resticService.indexSnapshots();
        }))
    }
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