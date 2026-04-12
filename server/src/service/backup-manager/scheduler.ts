import {
    backupTarget,
    commandType,
    type CommandType,
    execStatus,
    execution,
    type InsertExecutionSchema,
    jobSchedules, NEVER_CRON,
    repository,
    type ScheduleStatus,
    scheduleStatus,
    setting,
    strategy,
    StrategyType,
    updateBackupStrategySchema,
    type UpdateBackupTargetSchema,
    updateBackupTargetSchema,
    updateExecutionSchema,
    type UpdateExecutionSchema,
    updateJobScheduleSchema,
    type UpdateJobScheduleSchema,
    updateRepoScheduleSchema,
    type UpdateRepoScheduleSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    type UpdateRestoreSchema,
    updateStrategyScheduleSchema,
    type UpdateStrategyScheduleSchema,
    updateSystemScheduleSchema,
    type UpdateSystemScheduleSchema,
    type UpdateTargetScheduleSchema,
    updateTargetScheduleSchema
} from "@backstream/shared";
import {db} from "../db";
import {type ExecResult, ResticService} from "./restic-service";
import PQueue from "p-queue";
import {and, desc, eq, inArray, ne} from "drizzle-orm";
import {Cron} from "croner";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import {logger} from '../log/logger'

async function createExecution(commandType: CommandType, targetId?: number | null, repoId?: number | null) {
    let value: InsertExecutionSchema = {
        commandType: commandType,
        executeStatus: execStatus.PENDING,
        scheduledAt: Date.now(),
        uuid: crypto.randomUUID(),
    };
    if (targetId !== null) {
        value.backupTargetId = targetId;
    } else if (repoId !== null) {
        value.repositoryId = repoId
    }
    const [row] = await db.insert(execution).values(value).returning();
    return updateExecutionSchema.parse(row);
}

async function getJobWithRepo(jobScheduleId: number) {
    const dbResult = await db.query.jobSchedules.findFirst({
        where: (jobSchedules, { and, eq, ne }) => and(
            eq(jobSchedules.id, jobScheduleId),
            ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
        ),
        with: {
            repository: true,
        }
    });
    if (!dbResult || !dbResult.repository) return null;
    const job = updateJobScheduleSchema.parse(dbResult);
    const repo = updateRepositorySchema.parse(dbResult.repository);
    if (repo.adminStatus !== 'ACTIVE') return null;
    return {job, repo};
}

async function getJobWithTarget(jobScheduleId: number) {
    const dbResult = await db.query.jobSchedules.findFirst({
        where: (jobSchedules, { and, eq, ne }) => and(
            eq(jobSchedules.id, jobScheduleId),
            ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
        ),
        with: {
            repository: true,
            target: true,
            strategy: true
        }
    });
    if (!dbResult || !dbResult.repository || !dbResult.target || !dbResult.strategy) return null;
    const job = updateTargetScheduleSchema.parse(dbResult);
    const repo = updateRepositorySchema.parse(dbResult.repository);
    if (repo.adminStatus !== 'ACTIVE') return null;
    const target = updateBackupTargetSchema.parse(dbResult.target);
    const strategy = updateBackupStrategySchema.parse(dbResult.strategy);
    return {job, repo, target, strategy};
}

async function getRepoJob(repoId: number) {
    const dbResult = await db.query.repository.findFirst({
        where: (repository, { and, eq }) => and(
            eq(repository.id, repoId),
            eq(repository.adminStatus, 'ACTIVE'),
        ),
        with: {
            jobs: {
                where: (jobSchedules, { and, eq, ne }) => and(
                    eq(jobSchedules.category, 'repository'),
                    ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
                )
            }
        }
    });
    if (!dbResult || !dbResult.jobs?.length) return null;
    const repo = updateRepositorySchema.parse(dbResult);
    const jobs = updateRepoScheduleSchema.array().parse(dbResult.jobs);
    return {jobs, repo};
}

async function getTargetJob(strategyId: number) {
    const dbResult = await db.query.strategy.findFirst({
        where: (strategy, { eq }) => eq(strategy.id, strategyId),
        with: {
            jobs: {
                where: (jobSchedules, { and, eq, ne }) => and(
                    eq(jobSchedules.category, 'target'),
                    ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
                )
            }
        }
    });
    if (!dbResult || !dbResult.jobs?.length) return null;
    const strategy = updateBackupStrategySchema.parse(dbResult);
    const jobs = updateTargetScheduleSchema.array().parse(dbResult.jobs);
    return {jobs, strategy};
}

async function getStrategyJob(strategyId: number) {
    const dbResult = await db.query.strategy.findFirst({
        where: (strategy, { eq }) => eq(strategy.id, strategyId),
        with: {
            jobs: {
                where: (jobSchedules, { and, eq, ne }) => and(
                    eq(jobSchedules.category, 'strategy'),
                    ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
                )
            }
        }
    });
    if (!dbResult || !dbResult.jobs?.length) return null;
    const strategy = updateBackupStrategySchema.parse(dbResult);
    const strategyJob = updateStrategyScheduleSchema.parse(dbResult.jobs[0]);
    return {job: strategyJob, strategy: strategy};
}

type ClientInitialError = {
    error: any;
    message: string;
    initTimestamp: number;
}

// Type Alias combine repo with error
type ClientRecord =
    | ({ client: ResticService } & { status: 'active' })
    | (ClientInitialError & { status: 'error' })

export class Scheduler {
    private readonly clientMap: Map<number, ClientRecord>;
    private readonly cronJobMap: Map<number, { cron: Cron, job: UpdateJobScheduleSchema }>; // only job's category, type and ids is reliable
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
            if (validated.adminStatus === 'ACTIVE') scheduler.addResticService(validated, true);
        })
        // init strategy schedule
        const allStrategyIds = await db.select({ id: strategy.id}).from(strategy);
        allStrategyIds.forEach(({id}) => scheduler.addPolicySchedule(id))
        // init system schedule
        void scheduler.startSystemCron();
        return scheduler;
    }

    public async addResticService(
        repo: UpdateRepositorySchema,
        exist: boolean,
        fromRepo?: UpdateRepositorySchema
    ) {
        const key = repo.id;
        // check if already exist
        if (this.clientMap.has(key)) {
            const stopResult = await this.stopResticService(repo);
            if (stopResult.length > 0) {
                this.clientMap.set(key, {
                    error: stopResult,
                    message: `stop ResticService ${repo.name} fail: ${stopResult} still running`,
                    status: 'error',
                    initTimestamp: Date.now(),
                })
                return `stop ResticService ${repo.name} fail: ${stopResult} still running`;
            }
        }
        // check if fromRepo is active
        let fromRs: ResticService | undefined;
        if (fromRepo) {
            const clientRecord = await this.getResticService(fromRepo);
            if (clientRecord.status !== 'active') {
                const errorMsg = `fromRepo ${fromRepo.name} has error: ${clientRecord.message}`;
                this.clientMap.set(key, {
                    error: clientRecord.error,
                    message: errorMsg,
                    status: 'error',
                    initTimestamp: Date.now(),
                })
                return errorMsg;
            }
            fromRs = clientRecord.client;
        }
        // create repo
        const createResult = await ResticService.create(
            repo,
            this.globalQueue,
            exist,
            fromRs,
        );
        if (createResult instanceof ResticService) {
            this.clientMap.set(key, {
                client: createResult,
                status: 'active',
            });
            // start repo schedule
            void this.startRepoMaintainJob(repo.id);
        } else {
            this.clientMap.set(key, {
                error: new Error('create repo fail'),
                message: `create ResticService ${repo.name} fail: ${createResult}`,
                status: 'error',
                initTimestamp: Date.now(),
            });
            return createResult.toString();
        }
    }

    public async getResticService(repo: UpdateRepositorySchema) {
        const key = repo.id;
        if (!this.clientMap.has(key)) {
            await this.addResticService(repo, true);
        }
        return this.clientMap.get(key)!;
    }

    private async getRunningPolicyByRepo(repo: UpdateRepositorySchema): Promise<string[]> {
        const strategyIds: number[] = [];
        this.cronJobMap.forEach((jobRecord) => {
            const job = jobRecord.job;
            if (job.category === 'target' && job.repositoryId === repo.id) {
                strategyIds.push(job.backupStrategyId)
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
        this.cronJobMap.forEach((jobRecord, key) => {
            const job = jobRecord.job;
            if (job.category === 'repository' && job.repositoryId === repo.id) {
                if (jobRecord.cron.isRunning()) jobRecord.cron.stop();
                this.cronJobMap.delete(key);
            }
        });
        // 停止 restic service 所有任务
        const clientRecord = this.clientMap.get(repo.id);
        if (!clientRecord) return [];
        if (clientRecord.status === 'active') clientRecord.client.stopAllRunningJob();
        this.clientMap.delete(repo.id);
        return [];
    }

    public async stopPolicy(strategyId: number) {
        // stop and delete target job
        this.cronJobMap.forEach((jobRecord, key) => {
            const job = jobRecord.job;
            if ((job.category === 'strategy' || job.category === 'target') && job.backupStrategyId === strategyId) {
                if (jobRecord.cron.isRunning()) jobRecord.cron.stop();
                this.cronJobMap.delete(key);
            }
            if (job.category === 'target' && job.backupStrategyId === strategyId) {
                const clientRecord = this.clientMap.get(job.repositoryId);
                if (clientRecord && clientRecord.status === 'active') {
                    clientRecord.client.stopPolicyJob(job.backupTargetId);
                }
            }
        });
        return { status: 'success' };
    }

    public async pauseJob(jobScheduleId: number) {
        const jobRecord = this.cronJobMap.get(jobScheduleId);
        if (!jobRecord) return { message: 'Not found' };
        // stop job and update job schedule
        jobRecord.cron.pause();
        const [dbResult] = await db.update(jobSchedules)
            .set({ jobStatus: scheduleStatus.PAUSED })
            .where(eq(jobSchedules.id, jobRecord.job.id))
            .returning();
        if (!dbResult) return { message: `update job ${jobScheduleId} fail` };
        return { message: 'success' };
    }

    public async resumeJob(jobScheduleId: number) {
        const jobRecord = this.cronJobMap.get(jobScheduleId);
        if (!jobRecord) return { message: 'Not found' };
        if (jobRecord.cron.isStopped()) return { message: `can't resume, job permanently stopped` };
        // resume job and update job schedule
        jobRecord.cron.resume();
        const [dbResult] = await db.update(jobSchedules)
            .set({ jobStatus: scheduleStatus.ACTIVE })
            .where(eq(jobSchedules.id, jobRecord.job.id))
            .returning();
        if (!dbResult) return { message: `update job ${jobScheduleId} fail` };
        return { message: 'success' };
    }

    public triggerJob(jobScheduleId: number) {
        const jobRecord = this.cronJobMap.get(jobScheduleId);
        if (!jobRecord) return { message: 'Not found' };
        void jobRecord.cron.trigger();
        return { message: 'success' };
    }

    private async startRepoMaintainJob(repoId: number) {
        // get repo job
        const result = await getRepoJob(repoId);
        if (!result) return;
        const { jobs, repo } = result;
        for (const job of jobs) {
            switch (job.type) {
                case 'check': this.startRepoCheckCron(job); break;
                case 'prune': this.startRepoPruneCron(job); break;
                case 'heartbeat': await this.startRepoHeartBeat(job).trigger(); break;
                case 'stat': await this.startRepoStat(job).trigger(); break;
                case 'snapshots': await this.startRepoIndex(job).trigger(); break;
            }
        }
    }

    private startRepoCheckCron(job: UpdateRepoScheduleSchema) {
        return this.startCron(
            job,
            async (exec: UpdateExecutionSchema) => {
                // fetch job with repository
                const result = await getJobWithRepo(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: refetchJob, repo} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                const reValidJob = updateRepoScheduleSchema.parse(refetchJob);
                return await rs.client.check(
                    exec,
                    reValidJob.extraConfig?.checkPercentage ?? 0
                );
            },
            commandType.check
        )
    }

    private startRepoPruneCron(job: UpdateRepoScheduleSchema) {
        return this.startCron(
            job,
            async (exec: UpdateExecutionSchema) => {
                // fetch job with repository
                const result = await getJobWithRepo(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: _, repo} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                return await rs.client.prune(exec);
            },
            commandType.prune
        )
    }

    private startRepoHeartBeat(job: UpdateRepoScheduleSchema) {
        return this.startCron(
            job,
            async () => {
                // fetch job with repository
                const result = await getJobWithRepo(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: _, repo} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                return await rs.client.heartbeat();
            },
        )
    }

    private startRepoStat(job: UpdateRepoScheduleSchema) {
        return this.startCron(
            job,
            async () => {
                // fetch job with repository
                const result = await getJobWithRepo(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: _, repo} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                return await rs.client.updateRepoStat();
            }
        );
    }

    private startRepoIndex(job: UpdateRepoScheduleSchema) {
        return this.startCron(
            job,
            async () => {
                // fetch job with repository
                const result = await getJobWithRepo(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: _, repo} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                return await rs.client.indexSnapshots();
            }
        )
    }

    public async addPolicySchedule(strategyId: number) {
        const targetJobResult = await getTargetJob(strategyId);
        if (targetJobResult) {
            targetJobResult.jobs.forEach((job: UpdateTargetScheduleSchema) => {
                switch (job.type) {
                    case 'backup': void this.scheduleVersioningBackup(job); break;
                    case 'copy': void this.scheduleLocalSyncBackup(job); break;
                }
            })
        }
        // add strategy datasource size update
        const strategyJobResult = await getStrategyJob(strategyId);
        if (!strategyJobResult) return;
        // get data size immediately
        await this.startPolicyDatasizeCron(strategyJobResult.job).trigger();
    }

    private async scheduleVersioningBackup(job: UpdateTargetScheduleSchema) {
        return this.startCron(
            job,
            async (exec: UpdateExecutionSchema) => {
                // fetch job with target
                const result = await getJobWithTarget(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: _, repo, target, strategy} = result;
                const rs = await this.getResticService(repo);
                if (rs.status !== 'active') throw new Error(`repo ${repo.name} is not active`);
                return await rs.client.backup(exec, strategy.dataSource, target)
            },
            commandType.backup
        )
    }

    private async scheduleLocalSyncBackup(job: UpdateTargetScheduleSchema) {
        return this.startCron(
            job,
            async (exec: UpdateExecutionSchema) => {
                // fetch job with target
                const result = await getJobWithTarget(job.id);
                if (!result) throw new Error(`[Scheduler] can't find job or repo with id ${job.id}`);
                const {job: refetchJob, repo: remoteRepo, target: remoteTarget, strategy} = result;
                // get remote restic service
                const rs = await this.getResticService(remoteRepo);
                if (rs.status !== 'active') throw new Error(`repo ${remoteRepo.name} is not active`);
                const srcRepoId = refetchJob.extraConfig?.srcRepoId;
                if (!srcRepoId) throw new Error(`[Scheduler] copy job ${job.id} missing srcRepoId`);
                // get src restic service
                const [localRepo] = await db.select().from(repository).where(eq(repository.id, srcRepoId));
                if (!localRepo) throw new Error(`[Scheduler] can't find src repo ${srcRepoId}`);
                const localRs = await this.getResticService(updateRepositorySchema.parse(localRepo));
                if (localRs.status !== 'active') throw new Error(`repo ${localRepo.name} is not active`);
                // start copy
                return await localRs.client.copyTo(exec, strategy.dataSource, rs.client, remoteTarget);
            },
            commandType.copy
        )
    }

    private startPolicyDatasizeCron(job: UpdateStrategyScheduleSchema) {
        return this.startCron(
            job,
            async () => {
                // refetch strategy job
                const result = await getStrategyJob(job.backupStrategyId);
                if (!result) throw new Error(`[Scheduler] can't find strategy job with id ${job.id}`);
                const rc = new RcloneClient(); // local rclone
                const sizeResult = await rc.getSize(result.strategy.dataSource);
                if (!sizeResult.success) throw new Error(`get data size at path ${result.strategy.dataSource} failed.`);
                const dbResult = await db.update(strategy)
                    .set({ dataSourceSize: sizeResult.result.bytes })
                    .where(eq(strategy.id, result.strategy.id))
                    .returning();
                if (!dbResult) throw new Error(`update data size at path ${result.strategy.dataSource} failed.`);
            }
        )
    }

    private async startSystemCron() {
        const dbResult = await db.select().from(jobSchedules)
            .where(and(
                eq(jobSchedules.category, 'system'),
                ne(jobSchedules.jobStatus, scheduleStatus.PAUSED)
            ));
        if (!dbResult?.length) return;
        updateSystemScheduleSchema.array().parse(dbResult).forEach(job => {
            switch (job.type) {
                case 'clean': this.startTmpFolderCleanCron(job); break;
            }
        })
    }

    private startTmpFolderCleanCron(job: UpdateSystemScheduleSchema) {
        return this.startCron(
            job,
            async () => {
                const [systemSettings] = await db.select().from(setting)
                    .orderBy(desc(setting.id))
                    .limit(1);
                if (!systemSettings) throw new Error(`get system setting failed.`);
                const errors = await FileManager.clearTmpFolder(systemSettings.logRetentionDays);
                if (errors.length > 0) {
                    throw new Error(`clean tmp folder fail.\n` + errors.join('\n'));
                } else {
                    logger.debug(`clean tmp folder success.`);
                }
            }
        )
    }

    private startCron(
        job: UpdateJobScheduleSchema,
        taskFn: (execution: UpdateExecutionSchema) => Promise<ExecResult<any> | void>,
        commandType: CommandType,
    ): Cron;

    private startCron(
        job: UpdateJobScheduleSchema,
        taskFn: () => Promise<ExecResult<any> | void>,
        commandType?: undefined,
    ): Cron;

    private startCron(
        job: UpdateJobScheduleSchema,
        taskFn: (execution?: any) => Promise<ExecResult<any> | void>,
        commandType?: CommandType,
        {
            maxRetries = 3, // Corresponds to retryLimit
            initialDelayMs = 1000,
            jitterFactor = 0.2
    } = {}) {
        // stop previous job
        const previousJob = this.cronJobMap.get(job.id);
        if (previousJob) {
            logger.warn(`[Cron] Found existing instance for job ${job.id}. Cleaning up before restart.`);
            // Stop the cron execution
            previousJob.cron.stop();
            // Remove it from the map to ensure a clean slate
            this.cronJobMap.delete(job.id);
        }
        // create cron
        const cron = new Cron(job.cron, { protect: true }, async (self) => {
            // create execution if commandType is set
            let exec = commandType ? await createExecution(
                commandType,
                job.backupTargetId,
                job.repositoryId
            ) : undefined;
            // execute with retry
            let lastError: any;
            let lastMessage: string = `[Cron] job ${job.id} error`;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // update nextRunAt
                    const nextDate = new Cron(job.cron).nextRun();
                    if (nextDate === null && job.cron !== NEVER_CRON) throw new Error(`get job nextRunAt failed. cron is ${job.cron}`);
                    if (job.cron !== NEVER_CRON) {
                        const [dbResult] = await db.update(jobSchedules)
                            .set({ nextRunAt: new Cron(job.cron).nextRun()?.getTime() })
                            .where(eq(jobSchedules.id, job.id))
                            .returning();
                        if (!dbResult) throw new Error(`update job ${job.id} nextRunAt db fail`);
                    }
                    const execResult = await taskFn(exec);
                    // exec success then update lastRunAt return
                    if (!execResult || execResult.status === 'success') {
                        // update lastRunAt, early return
                        await db.update(jobSchedules).set({ lastRunAt: Date.now() }).where(eq(jobSchedules.id, job.id));
                        return;
                    }
                    //
                    lastError = execResult.error;
                    lastMessage = execResult.message;
                } catch (err: any) {
                    // Exception Case: Capture error and move to backoff
                    lastError = err;
                    lastMessage = err.message;
                    // throwing error considered pre execution error
                    if (exec) {
                        await db.update(execution)
                            .set({ errorMessage: lastMessage, finishedAt: Date.now(), executeStatus: execStatus.REJECT })
                            .where(eq(execution.id, exec.id))
                    }
                }
                // update lastRunAt, retry or exit
                await db.update(jobSchedules).set({ lastRunAt: Date.now() }).where(eq(jobSchedules.id, job.id));
                // Backoff Logic: Only runs if we haven't returned yet
                if (attempt < maxRetries) {
                    const expDelay = initialDelayMs * Math.pow(2, attempt);
                    const jitter = expDelay * jitterFactor * (Math.random() * 2 - 1);
                    const backoffDelay = Math.max(0, Math.min(expDelay + jitter, 60000)); // delay no more than 60 sec

                    logger.debug(`[Cron] Attempt ${attempt + 1} failed. Retrying in ${Math.round(backoffDelay / 1000)}s...`);
                    await new Promise(res => setTimeout(res, backoffDelay));
                } else {
                    // Exhaustion Case: Final attempt failed
                    logger.error(lastError, `[Cron] Max retries (${maxRetries}) reached. Last error: ${lastMessage}. Pausing job.`);
                    // stop cron, and update job schedule as 'error'
                    self.pause();
                    await db.update(jobSchedules)
                        .set({ jobStatus: scheduleStatus.ERROR })
                        .where(eq(jobSchedules.id, job.id));
                }
            }
        });
        // add cron to map
        this.cronJobMap.set(job.id, { cron, job });
        return cron;
    }
}