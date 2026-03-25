import {
    commandType,
    type CommandType,
    execution,
    type InsertExecutionSchema, type InsertRepositorySchema, type InsertRestoreSchema,
    type InsertSnapshotsMetadataSchema,
    insertSnapshotsMetadataSchema,
    repository,
    RepoType,
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
    type Task
} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq, and, inArray} from "drizzle-orm";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import { logger } from '../log/logger'
import path from "node:path";
import {Semaphore, withTimeout, E_TIMEOUT, Mutex} from 'async-mutex'


export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
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
        if (repo.repositoryType === RepoType.LOCAL) {
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
    ): Promise<ResticService | string> {
        const resticService = new ResticService(repo, queue);
        // create repo if not exist
        const initResult = await resticService.initRepo(exist);
        if (!initResult.success) return initResult.reason;
        return resticService;
    }

    public async renameRepo(name: string): Promise<UpdateRepositorySchema> {
        this.repo.name = name;
        const updatedRepo = await db.update(repository)
            .set({ name: name })
            .where(eq(repository.id, this.repo.id)).returning();
        return updateRepositorySchema.parse(updatedRepo);
    }

    private async initRepo(exist: boolean): Promise<{ success: true } | { success: false, reason: string }> {
        if (exist) {
            const result = await this.repoClient.createRepo();
            if (!result.success) {
                const [dbResult] = await db.update(repository)
                    .set({ repositoryStatus: 'Corrupt' })
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'create repo fail. ' + result.error.toString() };
            }
        } else {
            const result = await this.repoClient.isRepoExist();
            // 检查失败
            if (!result.success) {
                const [dbResult] = await db.update(repository)
                    .set({ repositoryStatus: 'Disconnected' })
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'repo not connected.' + result.error.toString() };
            }
            // 检查成功但是 repo 不存在
            if (!result.result) {
                const [dbResult] = await db.update(repository)
                    .set({ repositoryStatus: 'Corrupt' })
                    .where(eq(repository.id, this.repo.id))
                    .returning()
                this.repo = updateRepositorySchema.parse(dbResult);
                return { success: false, reason: 'repo not exist' };
            }
        }
        const [dbResult] = await db.update(repository)
            .set({ repositoryStatus: 'Active' })
            .where(eq(repository.id, this.repo.id))
            .returning()
        this.repo = updateRepositorySchema.parse(dbResult);
        return { success: true };
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
        if (this.repo.repositoryStatus === "Corrupt") return;
        let status: 'Active' | 'Disconnected';
        if (this.taskMap.size !== 0) {
            status = 'Active';
        } else {
            const result = await this.repoClient.isRepoExist();
            status = (result.success && result.result) ? 'Active' : 'Disconnected';
        }
        const updatedResult = await db.update(repository)
            .set({ repositoryStatus: status })
            .where(eq(repository.id, this.repo.id))
            .returning()
        this.repo = updateRepositorySchema.parse(updatedResult[0]);
        return;
    }

    public async updateRepoStat() {
        if (this.repo.repositoryStatus !== 'Active') return;
        // update repo stat
        let values: Partial<InsertRepositorySchema> = {};
        const repoStatResult = await this.retryOnLock(
            () => this.repoClient.getRepoStat(),
            false
        );
        if (repoStatResult.success) {
            const repoStat = repoStatResult.result;
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
        let capacity = this.repo.capacity;
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

    public async getSnapshotFiles(snapshot: UpdateSnapshotsMetadataSchema) {
        return await this.retryOnLock(
            () => this.repoClient.getSnapshotFilesByPath(snapshot.snapshotId),
            false
        )
    }

    // only support single file or dir
    public async restoreSnapshotFile(file: SnapshotFile, snapshot: UpdateSnapshotsMetadataSchema): Promise<number> {
        const newRestore = await this.createRestore(file, snapshot);
        const newExecution = await this.createExecution(
            commandType.restore,
            undefined,
            newRestore
        );
        // start restore, return immediately
        void (async () => {
            let serverPath;
            let task: Task<ResticResult<string>> | undefined;
            if (file.type === 'dir') {
                const fileFullPath = await FileManager.getZipFilePath(file.name);
                serverPath = fileFullPath;
                task = await this.startJob(
                    newExecution,
                    (log, err, signal) =>
                        this.repoClient.restoreFolder(
                            file.snapshotId,
                            {name: file.name, path: file.path},
                            fileFullPath,
                            log,
                            err,
                            newExecution.uuid,
                            signal
                        ),
                    false
                )
            } else {
                const dir = await FileManager.createTmpFolder();
                serverPath = path.join(dir, file.name);
                task = await this.startJob(
                    newExecution,
                    (log, err, signal) =>
                        this.repoClient.restoreFile(
                            file.snapshotId,
                            {name: file.name, path: file.path},
                            dir,
                            log,
                            err,
                            newExecution.uuid,
                            signal
                        ),
                    false
                );
            }
            if (!task) return;
            const result = await task.result;
            if (!result.success) return;
            logger.debug(`restore ${file.snapshotId}:${file.name} at ${this.repo.name} success`);
            await this.finalizeRestore(serverPath, newRestore);
        })();
        return newRestore.id;
    }

    public async copyTo(
        path: string,
        targetService: ResticService,
        target: UpdateBackupTargetSchema,
    ) {
        if (this.repo.repositoryStatus !== 'Active' || targetService.repo.repositoryStatus !== 'Active') return;
        // run remote retention policy against local in dry run mode, get what snapshot should be copy
        let keepSnapshotIds: string[] = [];
        const retryResult = await this.retryOnLock(
            () => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            true
        );
        if (!retryResult.success) {
            logger.warn(retryResult.error, `forget ${path} at ${this.repo.name} fail:`);
            return;
        }
        const forgetGroups = retryResult.result;
        const keepSnapshots: Snapshot[] = forgetGroups.flatMap(group => group.keep || []);
        keepSnapshotIds = keepSnapshots.map(s => s.id);
        // run copy
        const newExecution = await this.createExecution(commandType.copy, target);
        const task = await this.startJob(
            newExecution,
            (log, err, signal) =>
                this.repoClient.copyTo(
                    targetService.repoClient,
                    keepSnapshotIds,
                    log,
                    err,
                    newExecution.uuid,
                    signal
                )
            ,
            false,
            async () => await targetService.readLock(),
        )
        if (!task) return;
        const result = await task.result
        if (!result.success) return;
        logger.debug(`copyTo ${path} snapshots from ${this.repo.name} to ${targetService.repo.name} success`)
        // post backup
        void targetService.postBackupOperation(
            path,
            target,
            newExecution.id,
            null
        )
    }

    public async backup(path: string, target: UpdateBackupTargetSchema) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const newExecution = await this.createExecution(commandType.backup, target);
        // add to queue
        const task = await this.startJob(
            newExecution,
            (log, err, signal) =>
                this.repoClient.backup(path, log, err, newExecution.uuid, signal),
            false
        )
        if (!task) return;
        const result = await task.result
        if (!result.success) return;
        logger.debug(`backup ${this.repo.name} success`)
        // run post backup
        void this.postBackupOperation(path, target, newExecution.id, result.result.snapshotId);
    }

    public async postBackupOperation(
        path: string,
        target: UpdateBackupTargetSchema,
        executionId: number,
        snapshotId: string | undefined | null, // handle backup skipped
    ) {
        if (this.repo.repositoryStatus !== 'Active') return;
        // forget old data
        // todo: chance to get lock fail, consider using queue too
        const retryResult = await this.retryOnLock(
            () => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            true,
            5000
        );
        if (!retryResult.success) logger.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult.error.toString()}`);
        // only index just backup + forget snapshot
        await this.indexSnapshots(path);
        if (snapshotId === undefined || snapshotId === null) return;
        const [snapshotInDb] = await db.select().from(snapshotsMetadata)
            .where(eq(snapshotsMetadata.snapshotId, snapshotId))
        if (snapshotInDb) {
            // set execution's snapshot id
            await db.update(execution)
                .set({snapshotsMetadataId: snapshotInDb.id})
                .where(eq(execution.id, executionId))
        } else {
            logger.warn(`not found snapshot:${snapshotId} after index ${this.repo.name}`)
        }
    }

    public async indexSnapshots(path?: string) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const retryResult = await this.retryOnLock(
            () => this.repoClient.getSnapshots(path),
            false, 2500, 4
        );
        if (!retryResult.success) {
            logger.warn(retryResult.error, `indexSnapshots ${path} in ${this.repo.name} fail.`);
            return;
        }
        const snapshots = retryResult.result;
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
                    snapshotStatus: 'success',
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
            if (e === E_TIMEOUT) logger.warn(e, `index repo ${this.repo.name} timeout`);
            else logger.error(e, `index repo ${this.repo.name} error`);
        } finally {
            release?.();
        }
    }

    public async check() {
        if (this.repo.repositoryStatus === 'Disconnected') return;
        // insert execution as pending
        const newExecution = await this.createExecution(commandType.check);
        // add to queue
        const task = await this.startJob(
            newExecution,
            (log, err, signal) =>
                this.repoClient.check(log, err, this.repo.checkPercentage *  100, newExecution.uuid, signal),
        )
        if (!task) return;
        // update repo as corrupt if check failed
        const result = await task.result;
        if (!result.success) {
            if (!result.output) return; // not check command itself error;
            const [updatedResult] = await db.update(repository)
                .set({ repositoryStatus: 'Corrupt' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(updatedResult);
            logger.debug(`check repo ${this.repo.name} with num error > 0`)
            return;
        }
        // update repo as active
        const [updatedResult] = await db.update(repository)
            .set({ repositoryStatus: 'Active' })
            .where(eq(repository.id, this.repo.id))
            .returning()
        this.repo = updateRepositorySchema.parse(updatedResult);
        logger.debug(`check repo ${this.repo.name} with num error = 0`)
    }

    public async prune() {
        if (this.repo.repositoryStatus !== 'Active') return;
        // insert execution as pending
        const newExecution = await this.createExecution(commandType.prune);
        // add to queue
        const task = await this.startJob(
            newExecution,
            (log, err, signal) =>
                this.repoClient.prune(log, err, newExecution.uuid, signal)
        )
        if (!task) return;
        const result = await task.result;
        if (!result.success) return;
        logger.debug(`prune repo ${this.repo.name} success`)
    }

    private async startJob<T> (
        newExecution: UpdateExecutionSchema,
        job: (log: string, err: string, signal: AbortSignal) => Task<ResticResult<T>>,
        isExclusive: boolean = true,
        lockRemote?: () => Promise<() => void>,
    ): Promise<Task<ResticResult<T>> | undefined> {
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
                    const { logFile, errorFile } = await FileManager.createLogFile();
                    const task = job(logFile, errorFile, signal)
                    this.taskMap.set(newExecution.id, {
                        status: 'running',
                        controller: controller,
                        task: task
                    });
                    // update execution as running
                    await this.updateToRunning(newExecution, task);
                    // await the task finish then update final result
                    const result = await task.result;
                    // update execution
                    await this.finalizeExecution(newExecution, result);
                    return task;
                } catch (e) {
                    // Only throw if this wasn't a planned abort
                    if (!signal.aborted) {
                        throw new Error(`execution ${newExecution.id} failed: ${String(e)}`);
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
            } else {
                logger.error(error, `Setup error for ${newExecution.id}`);
            }
            return undefined;
        } finally {
            this.taskMap.delete(newExecution.id);
        }
    }

    // design to be fail fast, used for short living restic command: forget, snapshots, ls ......
    private async retryOnLock<T>(
        func: () => Promise<ResticResult<T>>,
        isExclusive: boolean = false,
        initialIntervalMs: number = 1000,
        retryCount: number = 3,
    ): Promise<RetryResult<T>> {
        let lastError: ResticError | any;
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const delay = initialIntervalMs * (attempt + 1);
                const result = await withTimeout(this.resticSem, delay)
                    .runExclusive(async () => await func(), isExclusive ? this.MAX_SEM_WEIGHT : 1);
                // 3. Check for success
                if (result.success) {
                    return {
                        success: true,
                        result: result.result,
                        attempts: attempt + 1
                    };
                }
                // fail for non locking issue, return
                if (result.error.exitCode !== ExitCode.FailedToLockRepository) {
                    return {
                        success: false,
                        error: result.error,
                        attempts: attempt + 1
                    }
                } else {
                    // Handle Failure, enter next attempt
                    lastError = result.error;
                }
            } catch (error) {
                lastError = error;
            }
        }
        return {
            success: false,
            error: lastError!,
            attempts: retryCount + 1
        };
    }

    private async createExecution(
        commandType: CommandType,
        target?: UpdateBackupTargetSchema,
        restore?: UpdateRestoreSchema,
    ): Promise<UpdateExecutionSchema> {
        let value: InsertExecutionSchema = {
            commandType: commandType,
            executeStatus: "pending",
            scheduledAt: Date.now(),
            uuid: crypto.randomUUID(),
        };
        if (target) {
            value.backupTargetId = target.id;
        } else if (restore) {
            value.restoresId = restore.id;
        } else {
            value.repositoryId = this.repo.id
        }
        const [row] = await db.insert(execution).values(value).returning();
        return updateExecutionSchema.parse(row);
    }

    private async cancelExecution(execId: number): Promise<void> {
        await db.update(execution).set({ executeStatus: "cancel" }).where(eq(execution.id, execId));
    }

    private async updateToRunning(exec: UpdateExecutionSchema, task: Task<any>) {
        await db.update(execution).set({
            logFile: task.logFile,
            errorFile: task.errorFile,
            fullCommand: task.command,
            startedAt: Date.now(),
            executeStatus: "running",
        }).where(eq(execution.id, exec.id));
    }

    private async finalizeExecution(exec: UpdateExecutionSchema, result: ResticResult<any>) {
        const status = result.success ? 'success'
            : result.error.rawResult.isCanceled ? 'cancel'
                : result.error.rawResult.isTerminated ? 'kill'
                    : 'fail'
        await db.update(execution).set({
            exitCode: result.success ? result.rawResult.exitCode : result.error.exitCode,
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
}

type RetryResult<T> =
    | { success: true; result: T; attempts: number }
    | { success: false; error: ResticError; attempts: number };

type ResticTask =
    | { status: 'waiting'; controller: AbortController }
    | { status: 'running'; controller: AbortController; task: Task<ResticResult<any>> };