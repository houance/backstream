import {
    commandType,
    type CommandType,
    execution, execStatus,
    type InsertExecutionSchema, type InsertRepositorySchema, type InsertRestoreSchema,
    insertSnapshotsMetadataSchema,
    repository,
    repoType,
    restores,
    type SnapshotFile,
    snapshotsMetadata,
    type UpdateBackupTargetSchema,
    updateExecutionSchema,
    type UpdateExecutionSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema, type UpdateRestoreSchema, updateRestoreSchema,
    type UpdateSnapshotsMetadataSchema,
    updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {
    ExitCode,
    RepositoryClient,
    ResticError,
    type ResticResult, type Snapshot,
    type Task, type Node
} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq, and, inArray} from "drizzle-orm";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import { logger } from '../log/logger'
import path from "node:path";
import {Semaphore, withTimeout, E_TIMEOUT, Mutex} from 'async-mutex'
import type {Result} from "execa";
import {mapResticCode} from "../restic/utils";


export class ResticService {
    public repo: UpdateRepositorySchema;
    private readonly repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private MAX_SEM_WEIGHT: number = 1000;
    private resticSem: Semaphore;
    private dbLock: Mutex;
    private readonly taskMap: Map<number, ResticTask> // <executionId, Task>
    private readonly rcloneClient: RcloneClient | null;

    public constructor(repo: UpdateRepositorySchema, queue: PQueue) {
        // init sem and mutex
        this.resticSem = new Semaphore(this.MAX_SEM_WEIGHT);
        this.dbLock = new Mutex();
        // init map
        this.taskMap = new Map();
        this.repo = repo;
        // convert to validate zod schema
        const validated = updateRepositorySchema.parse(repo);
        // init repo client
        this.repoClient = new RepositoryClient(
            validated.path,
            validated.password,
            validated.repositoryType,
            validated.certification
        )
        // if repo is local, init rclone client
        if (repo.repositoryType === repoType.LOCAL) {
            this.rcloneClient = new RcloneClient();
        } else {
            this.rcloneClient = null;
        }
        // init queue
        this.globalQueue = queue
    }

    public static async create(
        repo: UpdateRepositorySchema,
        queue: PQueue,
        exist: boolean,
        fromRs?: ResticService,
    ): Promise<ResticService | string> {
        if (
            fromRs
            && repo.repositoryType !== repoType.LOCAL
            && repo.repositoryType === fromRs.repo.repositoryType)
        {
            return 'init repository from same type is not supported';
        }
        const resticService = new ResticService(repo, queue);
        // create repo
        const initResult = await resticService.initRepo(repo, exist, fromRs);
        if (!initResult.success) return initResult.reason;
        return resticService;
    }

    private async initRepo(
        repo: UpdateRepositorySchema,
        exist: boolean,
        fromRs?: ResticService):
        Promise<{ success: true } | { success: false, reason: string }> {
        let initResult: ResticResult<boolean>;
        // check if repo exist
        if (exist) {
            initResult = await this.repoClient.isRepoExist();
            // network fail
            if (!initResult.success) {
                repo.linkStatus = 'DOWN';
                repo.healthStatus = 'INITIALIZE_FAIL';
                const [dbResult] = await db.update(repository)
                    .set(repo)
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'repo not connected.' + initResult.error.toString() };
            }
            // 检查成功但是 repo 不存在
            if (!initResult.result) {
                repo.linkStatus = 'UP';
                repo.healthStatus = 'CORRUPT';
                const [dbResult] = await db.update(repository)
                    .set(repo)
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'repo does not exist' };
            }
        } else {
            if (fromRs) {
                initResult = await this.repoClient.createRepoWithSameChunker(fromRs.repoClient);
            } else {
                initResult = await this.repoClient.createRepo();
            }
            if (!initResult.success) {
                repo.healthStatus = 'INITIALIZE_FAIL';
                const [dbResult] = await db.update(repository)
                    .set(repo)
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'create repo fail. ' + initResult.error.toString() };
            }
        }
        repo.linkStatus = 'UP';
        repo.healthStatus = 'HEALTH';
        repo.adminStatus = 'ACTIVE';
        const [dbResult] = await db.update(repository)
            .set(repo)
            .where(eq(repository.id, this.repo.id))
            .returning()
        this.repo = updateRepositorySchema.parse(dbResult);
        return { success: true };
    }

    public async renameRepo(name: string): Promise<UpdateRepositorySchema> {
        this.repo.name = name;
        const updatedRepo = await db.update(repository)
            .set({ name: name })
            .where(eq(repository.id, this.repo.id)).returning();
        return updateRepositorySchema.parse(updatedRepo);
    }

    public getRunningJob(execution: UpdateExecutionSchema): Task<ResticResult<any>> | null {
        const job = this.taskMap.get(execution.id);
        if (!job || job.status === 'waiting') return null;
        return job.task;
    }

    public stopAllRunningJob() {
        this.taskMap.forEach((value) => value.controller.abort('manual cancel'));
        this.taskMap.clear();
    }

    public async stopPolicyJob(targetId: number) {
        const dbResult = await db.select().from(execution)
            .where(and(
                eq(execution.backupTargetId, targetId),
                inArray(execution.executeStatus, ['running', 'pending'])
            ));
        if (!dbResult || dbResult.length === 0) return;
        dbResult.forEach(exec => {
            this.taskMap.get(exec.id)?.controller.abort('manual cancel');
            this.taskMap.delete(exec.id);
        })
    }

    public stopJobByExec(exec: UpdateExecutionSchema) {
        this.taskMap.get(exec.id)?.controller.abort('manual cancel');
        this.taskMap.delete(exec.id);
    }

    public async heartbeat() {
        let status: typeof this.repo.linkStatus;
        if (this.taskMap.size !== 0) {
            status = 'UP';
        } else {
            const result = await this.repoClient.isRepoExist();
            status = (result.success && result.result) ? 'UP' : 'DOWN';
        }
        const [updatedResult] = await db.update(repository)
            .set({ linkStatus: status })
            .where(eq(repository.id, this.repo.id))
            .returning();
        this.repo = updateRepositorySchema.parse(updatedResult);
    }

    public async updateRepoStat() {
        if (this.repo.healthStatus !== 'HEALTH') {
            return systemFail(new Error(`update repo stat fail. repo ${this.repo.name} is ${this.repo.healthStatus}`));
        }
        // update repo stat
        let values: Partial<InsertRepositorySchema> = {};
        const repoStatResult = await this.retryOnLock(
            () => this.repoClient.getRepoStat(),
            { isExclusive: false }
        );
        if (repoStatResult.status === 'success') {
            const repoStat = repoStatResult.data;
            values = {
                size: repoStat.totalSize,
                uncompressedSize: repoStat.totalUncompressedSize,
                blobCount: repoStat.totalBlobCount,
            }
        }
        // update repo version
        const repoConfigResult = await this.repoClient.getRepoConfig();
        if (repoConfigResult.success) {
            values.version = repoConfigResult.result.version;
        }
        // get repo capacity, only support local repo currently
        if (this.rcloneClient !== null && this.rcloneClient !== undefined) {
            const repoStat = await this.rcloneClient.getBackendStat(this.repo.path);
            if (repoStat.success && repoStat.result.total) values.capacity = repoStat.result.total;
        }
        if (Object.keys(values).length > 0) {
            const [updatedResult] = await db.update(repository)
                .set(values)
                .where(eq(repository.id, this.repo.id))
                .returning();
            if (updatedResult) {
                this.repo = updateRepositorySchema.parse(updatedResult);
            }
        }
    }

    public async getSnapshotFiles(snapshot: UpdateSnapshotsMetadataSchema): Promise<ExecResult<Node[]>> {
        if (this.repo.healthStatus !== 'HEALTH') return systemFail(new Error(`repo is ${this.repo.healthStatus}`));
        return await this.retryOnLock(
            () => this.repoClient.getSnapshotFilesByPath(snapshot.snapshotId),
            { isExclusive: false }
        )
    }

    // only support single file or dir
    public async restoreSnapshotFile(file: SnapshotFile, snapshot: UpdateSnapshotsMetadataSchema) {
        // design as submit -> check status -> return; return only key not ExecResult;
        const newRestore = await this.createRestore(file, snapshot);
        const newExecution = await this.createExecution(
            commandType.restore,
            newRestore
        );
        // start restore, return immediately
        void (async () => {
            let serverPath;
            let restoreResult: ExecResult<string> | undefined;
            if (file.type === 'dir') {
                const fileFullPath = await FileManager.getZipFilePath(file.name);
                serverPath = fileFullPath;
                restoreResult = await this.startJob(
                    newExecution,
                    (log, signal) =>
                        this.repoClient.restoreFolder(
                            file.snapshotId,
                            {name: file.name, path: file.path},
                            fileFullPath,
                            log,
                            newExecution.uuid,
                            signal
                        ),
                    { isExclusive: false}
                )
            } else {
                const dir = await FileManager.createTmpFolder();
                serverPath = path.join(dir, file.name);
                restoreResult = await this.startJob(
                    newExecution,
                    (log, signal) =>
                        this.repoClient.restoreFile(
                            file.snapshotId,
                            {name: file.name, path: file.path},
                            dir,
                            log,
                            newExecution.uuid,
                            signal
                        ),
                    { isExclusive: false }
                );
            }
            if (restoreResult.status !== 'success') {
                logger.warn(restoreResult.error, `restore ${newRestore.id} fail.`);
            }
            logger.debug(`restore ${file.snapshotId}:${file.name} at ${this.repo.name} success`);
            await this.finalizeRestore(serverPath, newRestore);
        })();
        return newRestore.id;
    }

    public async copyTo(
        exec: UpdateExecutionSchema,
        path: string,
        targetService: ResticService,
        target: UpdateBackupTargetSchema,
    ) {
        // check if repo health
        const msg = await this.canExecuteJob(exec);
        if (msg !== null) return systemFail(new Error(msg));
        const msgRemote = await targetService.canExecuteJob(exec);
        if (msgRemote !== null) return systemFail(new Error(msgRemote));
        // check if two repo same type, as fall back
        if (this.repo.repositoryType !== repoType.LOCAL && this.repo.repositoryType === targetService.repo.repositoryType) {
            const msg = 'copy between same type of repositories is not supported';
            return this.rejectExecution(exec, msg);
        }
        // check if repo limit reach
        if (targetService.repo.adminStatus === 'QUOTA_EXCEEDED') {
            const msg = `backup ${path} to ${this.repo.name} fail. quota exceeded`;
            return targetService.rejectExecution(exec, msg);
        }
        // run remote retention policy against local in dry run mode, get what snapshot should be copy
        let keepSnapshotIds: string[] = [];
        const retryResult = await this.retryOnLock(
            () => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            { isExclusive: true }
        );
        if (retryResult.status !== 'success') {
            logger.warn(retryResult.error, `forget ${path} at ${this.repo.name} fail:`);
            return this.preFailExecution(exec, retryResult);
        }
        const forgetGroups = retryResult.data;
        const keepSnapshots: Snapshot[] = forgetGroups.flatMap(group => group.keep || []);
        keepSnapshotIds = keepSnapshots.map(s => s.id);
        // check if copy exceed limit, upper bound estimate
        if (targetService.repo.storageLimit !== null && targetService.repo.size) {
            const totalAdded = keepSnapshots.reduce((sum, s) => sum + (s.summary?.dataAddedPacked ?? 0), 0);
            if (totalAdded + targetService.repo.size >= targetService.repo.storageLimit) {
                const msg = `reach repo ${targetService.repo.name} limit ${targetService.repo.storageLimit}`;
                logger.warn(msg);
                this.repo = updateRepositorySchema.parse(await db.update(repository).set({
                    adminStatus: 'QUOTA_EXCEEDED',
                }).where(eq(repository.id, targetService.repo.id)).returning())
                return targetService.rejectExecution(exec, msg);
            }
        }
        // run copy
        const copyResult = await this.startJob(
            exec,
            (log, signal) =>
                this.repoClient.copyTo(
                    targetService.repoClient,
                    keepSnapshotIds,
                    log,
                    exec.uuid,
                    signal
                )
            ,
            { isExclusive: false },
            async () => await targetService.readLock(),
        )
        if (copyResult.status !== 'success') return copyResult;
        logger.debug(`copyTo ${path} snapshots from ${this.repo.name} to ${targetService.repo.name} success`)
        // post backup
        return  targetService.postBackupOperation(
            path,
            target,
            exec.id,
            null
        )
    }

    public async backup(exec: UpdateExecutionSchema, path: string, target: UpdateBackupTargetSchema) {
        // check if repo full
        if (this.repo.adminStatus === 'QUOTA_EXCEEDED') {
            const msg = `backup ${path} to ${this.repo.name} fail. quota exceeded`;
            await db.update(execution).set({
                errorMessage: msg,
                finishedAt: Date.now(),
                executeStatus: execStatus.REJECT
            }).where(eq(execution.id, exec.id));
            return systemFail(new Error(msg))
        }
        // dry run get new added size
        if (this.repo.storageLimit !== null && this.repo.size) {
            const dryRunResult = await this.retryOnLock(
                () => this.repoClient.backupDryRun(path),
            );
            if (dryRunResult.status !== 'success') {
                logger.warn(dryRunResult.error, `backup ${path} to ${this.repo.name} dry run failed.`);
                return this.preFailExecution(exec, dryRunResult);
            }
            if (dryRunResult.data.dataAddedPacked + this.repo.size >= this.repo.storageLimit) {
                const msg = `reach repo ${this.repo.name} limit ${this.repo.storageLimit}`;
                logger.warn(msg);
                this.repo = updateRepositorySchema.parse(await db.update(repository).set({
                    adminStatus: 'QUOTA_EXCEEDED',
                }).where(eq(repository.id, this.repo.id)).returning())
                return this.rejectExecution(exec, msg);
            }
        }
        // add to queue
        const backupResult = await this.startJob(
            exec,
            (log, signal) =>
                this.repoClient.backup(path, log, exec.uuid, signal),
            { isExclusive: false }
        )
        switch (backupResult.status) {
            case 'success':{
                logger.debug(`backup ${this.repo.name} for path:${path} success`)
                // run post backup
                return this.postBackupOperation(path, target, exec.id, backupResult.data.snapshotId);
            }
            case 'system_error': return backupResult;
            case 'restic_error': {
                logger.warn(backupResult.error, `backup ${this.repo.name} for path:${path} partial.`)
                return this.postBackupOperation(path, target, exec.id, backupResult.errorOutput?.snapshotId, true);
            }
        }
    }

    public async postBackupOperation(
        path: string,
        target: UpdateBackupTargetSchema,
        executionId: number,
        snapshotId: string | undefined | null, // handle backup skipped
        partialSnapshot: boolean = false,
    ) {
        // forget old data
        const retryResult = await this.retryOnLock(
            () => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            { isExclusive: true, initialIntervalMs: 5000 },
        );
        if (retryResult.status !== 'success') {
            logger.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult.error.toString()}`);
            return retryResult;
        }
        // only index just backup + forget snapshot
        await this.indexSnapshots(path, partialSnapshot ? snapshotId : undefined);
        if (snapshotId === undefined || snapshotId === null) return;
        const [snapshotInDb] = await db.select().from(snapshotsMetadata)
            .where(and(
                eq(snapshotsMetadata.repositoryId, this.repo.id),
                eq(snapshotsMetadata.snapshotId, snapshotId),
            ))
        if (snapshotInDb) {
            // set execution's snapshot id
            await db.update(execution)
                .set({snapshotsMetadataId: snapshotInDb.id})
                .where(eq(execution.id, executionId))
        } else {
            logger.warn(`not found snapshot:${snapshotId} after index ${this.repo.name}`)
        }
        // update stat to get new repo size
        return this.updateRepoStat();
    }

    public async indexSnapshots(path?: string, partialSnapId?: string | undefined | null) {
        const retryResult = await this.retryOnLock(
            () => this.repoClient.getSnapshots(path),
            { initialIntervalMs: 2500, retryLimit: 4 }
        );
        if (retryResult.status !== 'success') {
            logger.warn(retryResult.error, `indexSnapshots ${path} in ${this.repo.name} fail.`);
            return retryResult;
        }
        const snapshots = retryResult.data;
        if (snapshots.length === 0) return;
        let release: (() => void) | undefined;
        try {
            release = await withTimeout(this.dbLock, 5000).acquire();
            // 1. Fetch existing records
            const query = db.select().from(snapshotsMetadata)
                .where(and(
                    eq(snapshotsMetadata.repositoryId, this.repo.id),
                    path ? eq(snapshotsMetadata.path, path) : undefined
                ));
            const dbRecords = updateSnapshotsMetadataSchema.array().parse(await query);
            const dbIds = new Set(dbRecords.map(d => d.snapshotId));
            const localIds = new Set(snapshots.map(s => s.id));
            // 2. Identify New Snapshots (in Remote, not in DB)
            const newSnapshots = snapshots
                .filter(s => !dbIds.has(s.id))
                .map(s => insertSnapshotsMetadataSchema.parse({
                    repositoryId: this.repo.id,
                    path: s.paths[0],
                    snapshotId: s.id,
                    hostname: s.hostname,
                    username: s.username,
                    uid: s.uid,
                    gid: s.gid,
                    excludes: s.excludes,
                    tags: s.tags,
                    programVersion: s.programVersion,
                    time: s.time,
                    snapshotStatus: s.id === partialSnapId ? 'partial' : 'success',
                    snapshotSummary: s.summary,
                    size: s.summary?.totalBytesProcessed ?? 0
                }));
            // 3. Identify Deleted Snapshots (in DB, not in Remote)
            const deleteIds = dbRecords
                .filter(d => !localIds.has(d.snapshotId))
                .map(d => d.id);
            // 4. Batch Operations
            if (newSnapshots.length > 0) await db.insert(snapshotsMetadata).values(newSnapshots);
            if (deleteIds.length > 0) {
                await db.delete(snapshotsMetadata).where(inArray(snapshotsMetadata.id, deleteIds));
            }
            logger.debug(`index repo ${this.repo.name} success`);
        } catch (e) {
            if (e === E_TIMEOUT) {
                logger.warn(e, `index repo ${this.repo.name} timeout`);
                return systemFail(new Error(`index repo ${this.repo.name} db lock timeout`, { cause: e }))
            } else {
                logger.error(e, `index repo ${this.repo.name} error`);
                return systemFail(new Error(`index repo ${this.repo.name} error`, { cause: e }));
            }
        } finally {
            release?.();
        }
    }

    public async check(execution: UpdateExecutionSchema, percentage: number) {
        // add to queue
        const execResult = await this.startJob(
            execution,
            (log, signal) =>
                this.repoClient.check(log, percentage *  100, execution.uuid, signal),
            { checkRepoCorrupt: false }
        )
        switch (execResult.status) {
            case 'success': {
                // update repo as active
                this.repo.healthStatus = 'HEALTH';
                const [updatedResult] = await db.update(repository)
                    .set(this.repo)
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(updatedResult);
                logger.debug(`check repo ${this.repo.name} with num error = 0`);
                return;
            }
            case 'system_error': return execResult;
            case 'restic_error': {
                if (!execResult.errorOutput) return execResult; // fail not due to repo corrupt
                this.repo.healthStatus = 'CORRUPT';
                const [updatedResult] = await db.update(repository)
                    .set(this.repo)
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(updatedResult);
                logger.warn(`check repo ${this.repo.name} with num error > 0`)
                return execResult;
            }
        }
    }

    public async prune(execution: UpdateExecutionSchema,) {
        // add to queue
        const execResult = await this.startJob(
            execution,
            (log, signal) =>
                this.repoClient.prune(log, execution.uuid, signal)
        )
        if (execResult.status !== 'success') return execResult;
        logger.debug(`prune repo ${this.repo.name} success`)
    }

    private async startJob<T> (
        newExecution: UpdateExecutionSchema,
        job: (log: string, signal: AbortSignal) => Task<ResticResult<T>>,
        { isExclusive = true, checkRepoCorrupt = true, } = {},
        lockRemote?: () => Promise<() => void>,
    ): Promise<ExecResult<T>> {
        // check if repo allow executed
        const msg = await this.canExecuteJob(newExecution, checkRepoCorrupt);
        if (msg !== null) return systemFail(new Error(msg));
        // create abort signal
        const controller = new AbortController();
        const { signal } = controller;
        this.taskMap.set(newExecution.id, { status: 'waiting', controller: controller });
        try {
            return await this.globalQueue.add(async () => {
                // lock local
                const [, r1] = await this.resticSem.acquire(isExclusive ? this.MAX_SEM_WEIGHT : 1);
                // lock remote if provide
                const r2 = lockRemote ? await lockRemote() : undefined;
                try {
                    // create log file and start
                    const logFile = await FileManager.createLogFile();
                    const task = job(logFile, signal)
                    this.taskMap.set(newExecution.id, {
                        status: 'running',
                        controller: controller,
                        task: task
                    });
                    // update execution as running
                    await this.runningExecution(newExecution, task);
                    // await the task finish then update final resticResult
                    const resticResult = await task.result;
                    // update execution
                    await this.finalizeExecution(newExecution, resticResult);
                    if (resticResult.success) return success(resticResult.result, resticResult.rawResult);
                    else return resticFail(resticResult.error, resticResult.output);
                } catch (e) {
                    if (signal.aborted) {
                        // as fall back. since signal aborted will resolve not reject running job;
                        return systemFail(new Error('task canceled when execution'))
                    } else {
                        throw new Error(`execution ${newExecution.id} failed: ${String(e)}`, { cause: e });
                    }
                } finally {
                    // unlocking
                    if (r2) r2();
                    if (r1) r1();
                }
            }, { signal: signal });
        } catch (error) {
            // If we are here, the task was likely aborted while WAITING in the queue
            if (signal.aborted) {
                await this.cancelExecution(newExecution.id);
                return systemFail(new Error(`task ${newExecution.id} canceled before execution`));
            } else {
                logger.error(error, `Setup error for ${newExecution.id}`);
                return systemFail(new Error(`Setup error for ${newExecution.id}`, { cause: error }));
            }
        } finally {
            this.taskMap.delete(newExecution.id);
        }
    }

    // design to be systemFail fast, used for short living restic command: forget, snapshots, ls ......
    private async retryOnLock<T>(
        func: () => Promise<ResticResult<T>>,
        { isExclusive = false, initialIntervalMs = 1000, retryLimit = 3 } = {},
    ): Promise<ExecResult<T>> {
        let lastError: ResticError | any;
        for (let attempt = 0; attempt <= retryLimit; attempt++) {
            try {
                const delay = initialIntervalMs * (attempt + 1);
                if (this.repo.adminStatus === 'PAUSED' || this.repo.healthStatus !== 'HEALTH') {
                    throw new Error(`repo ${this.repo.name} status ${this.repo.adminStatus}/${this.repo.healthStatus} not allow`)
                }
                const result = await withTimeout(this.resticSem, delay)
                    .runExclusive(async () => await func(), isExclusive ? this.MAX_SEM_WEIGHT : 1);
                // 3. Check for success
                if (result.success) {
                    return success(result.result, result.rawResult, attempt + 1);
                }
                // systemFail for non locking issue, return
                if (result.error.exitCode !== ExitCode.FailedToLockRepository) {
                    return resticFail(result.error, result.output, attempt + 1);
                } else {
                    // Handle Failure, enter next attempt
                    lastError = result.error;
                }
            } catch (error) {
                lastError = error;
            }
        }
        return systemFail(lastError!, retryLimit);
    }

    private async createExecution(
        commandType: CommandType,
        restore: UpdateRestoreSchema,
    ): Promise<UpdateExecutionSchema> {
        let value: InsertExecutionSchema = {
            commandType: commandType,
            executeStatus: execStatus.PENDING,
            scheduledAt: Date.now(),
            uuid: crypto.randomUUID(),
            restoresId: restore.id,
        };
        const [row] = await db.insert(execution).values(value).returning();
        return updateExecutionSchema.parse(row);
    }

    private async cancelExecution(execId: number): Promise<void> {
        await db.update(execution).set({ executeStatus: execStatus.CANCEL }).where(eq(execution.id, execId));
    }

    private async runningExecution(exec: UpdateExecutionSchema, task: Task<any>) {
        await db.update(execution).set({
            logFile: task.logFile,
            fullCommand: task.command,
            startedAt: Date.now(),
            executeStatus: execStatus.RUNNING,
        }).where(eq(execution.id, exec.id));
    }

    private async preFailExecution(exec: UpdateExecutionSchema, execResult: ExecResult<any>) {
        switch (execResult.status) {
            case 'restic_error': {
                await db.update(execution).set({
                    exitCode: execResult.error.exitCode,
                    errorMessage: execResult.message,
                    finishedAt: Date.now(),
                    executeStatus: execStatus.FAIL,
                }).where(eq(execution.id, exec.id));
                return resticFail(execResult.error);
            }
            case 'system_error': {
                await db.update(execution).set({
                    errorMessage: execResult.message,
                    finishedAt: Date.now(),
                    executeStatus: execStatus.REJECT,
                }).where(eq(execution.id, exec.id));
                return systemFail(execResult.error);
            }
        }
    }

    private async rejectExecution(exec: UpdateExecutionSchema, msg: string) {
        await db.update(execution).set({
            errorMessage: msg,
            finishedAt: Date.now(),
            executeStatus: execStatus.REJECT
        }).where(eq(execution.id, exec.id));
        return systemFail(new Error(msg));
    }

    private async finalizeExecution(exec: UpdateExecutionSchema, result: ResticResult<any>) {
        let status:string, exitCode: number, errorMessage: string;
        if (result.success) {
            status = execStatus.SUCCESS;
            exitCode = result.rawResult.exitCode ?? ExitCode.Success;
            errorMessage = '';
        } else {
            status = result.error.rawResult.isCanceled ? execStatus.CANCEL
                : result.error.rawResult.isTerminated ? execStatus.KILL
                    : execStatus.FAIL;
            exitCode = mapResticCode(result.error.exitCode);
            errorMessage = Object.entries(ExitCode).find(([_, v]) => v === exitCode)?.[0] ?? "UNKNOWN";
        }
        await db.update(execution).set({
            exitCode: exitCode,
            errorMessage: errorMessage,
            finishedAt: Date.now(),
            executeStatus: status
        }).where(eq(execution.id, exec.id));
    }

    private async createRestore(file: SnapshotFile, snapshot: UpdateSnapshotsMetadataSchema) {
        const value: InsertRestoreSchema = {
            snapshotsMetadataId: snapshot.id,
            files: [{
                path: file.path,
                name: file.name,
                type: file.type
            }],
            createdAt: Date.now()
        }
        const [row] = await db.insert(restores).values(value).returning();
        return updateRestoreSchema.parse(row);
    }

    private async finalizeRestore(serverPath: string, restore: UpdateRestoreSchema) {
        const { size, name, type } = await FileManager.getFileInfo(serverPath);
        await db.update(restores).set({
            serverPath: serverPath,
            resultName: name,
            resultType: type,
            resultSize: size,
            finishedAt: Date.now()
        }).where(eq(restores.id, restore.id));
    }

    public async readLock() {
        const [, releaseFunc] = await this.resticSem.acquire(1);
        return releaseFunc;
    }

    private async canExecuteJob(exec: UpdateExecutionSchema, checkRepoCorrupt: boolean = true): Promise<string | null> {
        // check if repo allow executed
        if (this.repo.adminStatus === 'PAUSED'
            || (checkRepoCorrupt && this.repo.healthStatus !== 'HEALTH')) {
            const msg = `repo ${this.repo.name} status ${this.repo.adminStatus}/${this.repo.healthStatus} is not allow`;
            await db.update(execution)
                .set({ errorMessage: msg, finishedAt: Date.now(), executeStatus: execStatus.REJECT })
                .where(eq(execution.id, exec.id));
            return msg;
        }
        return null;
    }
}

type ResticTask =
    | { status: 'waiting'; controller: AbortController }
    | { status: 'running'; controller: AbortController; task: Task<ResticResult<any>> };

export type ExecResult<T> = {
    attempts?: number;
} & (
        | { status: 'success', data: T, rawResult: Result } // flat result list
        | { status: 'system_error', error: Error, message: string }
        | { status: 'restic_error', error: ResticError, message: string, errorOutput?: T } // flat result list
    );

function success<T>(data: T, rawResult: Result, attempts?: number): ExecResult<T> {
    return { status: 'success', data: data, rawResult, attempts };
}

function systemFail<T>(error: Error, attempts?: number): ExecResult<T> {
    return { status: 'system_error', error: error, message: error.message, attempts };
}

function resticFail<T>(resticError: ResticError, errorOutput?: T, attempts?: number): ExecResult<T> {
    return { status: 'restic_error', error: resticError, message: resticError.toString(), errorOutput, attempts };
}