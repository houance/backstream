import {
    commandType,
    type CommandType,
    execution,
    type InsertExecutionSchema, type InsertRestoreSchema,
    type InsertSnapshotsMetadataSchema,
    insertSnapshotsMetadataSchema,
    repository,
    RepoType,
    type RestoreJobKey, restores,
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
import pWaitFor from "p-wait-for";
import {RcloneClient} from "../rclone";
import {FileManager} from "./file-manager";
import { logger } from '../log/logger'
import path from "node:path";

export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private reader = 0; // simple rw lock
    private readonly jobMap: Map<number, ResticJob> // <executionId, Task>
    private readonly rcloneClient: RcloneClient | null;

    public constructor(repo: UpdateRepositorySchema, queue: PQueue) {
        // init map
        this.jobMap = new Map();
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

    public static async create(repo: UpdateRepositorySchema, queue: PQueue): Promise<ResticService | ResticError> {
        const resticService = new ResticService(repo, queue);
        // create repo if not exist
        const initResult = await resticService.initRepo();
        if (!initResult.success) return initResult.error;
        return resticService;
    }

    public async renameRepo(name: string): Promise<UpdateRepositorySchema> {
        this.repo.name = name;
        const updatedRepo = await db.update(repository)
            .set({ name: name })
            .where(eq(repository.id, this.repo.id)).returning();
        return updateRepositorySchema.parse(updatedRepo);
    }

    private async initRepo() {
        // 检查 repo 是否存在
        const isRepoExists = await this.repoClient.isRepoExist();
        // 检查失败
        if (!isRepoExists.success) {
            const [dbResult] = await db.update(repository)
                .set({ repositoryStatus: 'Disconnected' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult);
            return isRepoExists;
        }
        // repo 已创建
        if (isRepoExists.result) {
            const [dbResult] = await db.update(repository)
                .set({ repositoryStatus: 'Active' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult);
            return isRepoExists;
        }
        // repo 未创建
        const result = await this.repoClient.createRepo();
        if (result.success) {
            const [dbResult] = await db.update(repository)
                .set({ repositoryStatus: 'Active' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult);
        } else {
            // 创建失败
            const [dbResult] = await db.update(repository)
                .set({ repositoryStatus: 'Corrupt' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult);
        }
        return result;
    }

    public getRunningJob(execution: UpdateExecutionSchema): Task<ResticResult<any>> | null {
        const job = this.jobMap.get(execution.id);
        if (!job || job.status === 'waiting') return null;
        return job.task;
    }

    public stopAllRunningJob() {
        this.jobMap.forEach((value) => value.controller.abort('manual cancel'));
        this.jobMap.clear();
    }

    public async stopPolicyJob(targetId: number) {
        const dbResult = await db.select().from(execution)
            .where(and(
                eq(execution.backupTargetId, targetId),
                inArray(execution.executeStatus, ['running', 'pending'])
            ));
        if (!dbResult || dbResult.length === 0) return;
        dbResult.forEach(exec => {
            this.jobMap.get(exec.id)?.controller.abort('manual cancel');
            this.jobMap.delete(exec.id);
        })
    }

    public stopJobByExec(exec: UpdateExecutionSchema) {
        this.jobMap.get(exec.id)?.controller.abort('manual cancel');
        this.jobMap.delete(exec.id);
    }

    public async updateStat() {
        if (this.repo.repositoryStatus === "Corrupt") return;
        let status: 'Active' | 'Disconnected';
        if (this.jobMap.size !== 0) {
            status = 'Active';
        } else {
            const result = await this.repoClient.isRepoExist();
            status = (result.success && result.result) ? 'Active' : 'Disconnected';
        }
        // shortcut later db update
        if (status === 'Disconnected') {
            const updatedResult = await db.update(repository)
                .set({ repositoryStatus: status })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(updatedResult[0]);
            return;
        }
        // update repo stat
        const repoSize = await this.repoClient.getRepoSize();
        const usage = repoSize.success ? repoSize.result.totalSize : this.repo.usage;
        // get repo capacity, only support local repo currently
        let capacity = this.repo.capacity;
        if (this.rcloneClient !== null && this.rcloneClient !== undefined) {
            const repoStat = await this.rcloneClient.getBackendStat(this.repo.path);
            if (repoStat.success && repoStat.result.total) capacity = repoStat.result.total;
        }
        const [updatedResult] = await db.update(repository)
            .set({ repositoryStatus: status, usage: usage, capacity: capacity })
            .where(eq(repository.id, this.repo.id))
            .returning();
        this.repo = updateRepositorySchema.parse(updatedResult);
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
            async () => await targetService.readUnlock()
        )
        if (!task) return;
        const result = await task.result
        if (!result.success) return;
        logger.debug(`copyTo ${path} snapshots from ${this.repo.name} to ${targetService.repo.name} success`)
        // run remote retention policy against remote for cleaning up old data
        const retryResult2 = await targetService.retryOnLock(
            () => targetService.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            true
        );
        if (!retryResult2.success) logger.warn(retryResult2.error, `forget ${path} at ${this.repo.name} fail:`)
        // remote repo index snapshot
        void targetService.indexSnapshots(path);
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
        if (!result.success || result.result.snapshotId === undefined || result.result.snapshotId === null) return;
        logger.debug(`backup ${this.repo.name} success`)
        // index snapshots
        await this.indexSnapshots(path);
        const [snapshotInDb] = await db.select().from(snapshotsMetadata)
            .where(eq(snapshotsMetadata.snapshotId, result.result.snapshotId))
        if (snapshotInDb) {
            // set execution's snapshot id
            await db.update(execution)
                .set({ snapshotsMetadataId: snapshotInDb.id })
                .where(eq(execution.id, newExecution.id))
        } else {
            logger.warn(`not found snapshot:${result.result.snapshotId} after index ${this.repo.name}`)
        }
        // forget old data
        const retryResult = await this.retryOnLock(
            () => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy),
            true,
        );
        if (!retryResult.success) logger.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult.error.toString()}`);
    }

    public async indexSnapshots(path?: string) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const retryResult = await this.retryOnLock(
            () => this.repoClient.getSnapshots(path),
            false,
            2500,
            4,
        )
        if (!retryResult.success) {
            logger.warn(retryResult.error, `indexSnapshots ${path} in ${this.repo.name} fail.`);
            return;
        }
        const snapshots = retryResult.result;
        if (snapshots.length === 0) return;
        let validatedDbResult: UpdateSnapshotsMetadataSchema[];
        if (path) {
            const dbResult = await db.select().from(snapshotsMetadata)
                .where(and(eq(snapshotsMetadata.path, path), eq(snapshotsMetadata.repositoryId, this.repo.id)))
            validatedDbResult = updateSnapshotsMetadataSchema.array().parse(dbResult);
        } else {
            const dbResult = await db.select().from(snapshotsMetadata)
                .where(eq(snapshotsMetadata.repositoryId, this.repo.id))
            validatedDbResult = updateSnapshotsMetadataSchema.array().parse(dbResult);
        }
        const newSnapshots: InsertSnapshotsMetadataSchema[] = [];
        for (const snapshot of snapshots) {
            let hit = false;
            validatedDbResult.forEach((dbResult) => {
                if (snapshot.id === dbResult.snapshotId) {
                    hit = true;
                    return ;
                }
            })
            if (!hit) {
                // get snapshot size
                const snapshotStat = await this.repoClient.getSnapshotSize(snapshot.id);
                const tmp = {
                    repositoryId: this.repo.id,
                    path: snapshot.paths[0],
                    snapshotId: snapshot.id,
                    hostname: snapshot.hostname,
                    username: snapshot.username,
                    uid: snapshot.uid,
                    gid: snapshot.gid,
                    excludes: snapshot.excludes,
                    tags: snapshot.tags,
                    programVersion: snapshot.programVersion,
                    time: snapshot.time,
                    snapshotStatus: 'success',
                    snapshotSummary: snapshot.summary,
                    size: snapshotStat.success ? snapshotStat.result.totalSize : 0
                }
                newSnapshots.push(insertSnapshotsMetadataSchema.parse(tmp))
            }
        }
        const deleteSnapshots: UpdateSnapshotsMetadataSchema[] = [];
        validatedDbResult.forEach((dbResult) => {
            let hit = false;
            snapshots.forEach((snapshot) => {
                if (dbResult.snapshotId === snapshot.id) {
                    hit = true;
                    return;
                }
            })
            if (!hit) deleteSnapshots.push(dbResult);
        })
        // create
        if (newSnapshots.length > 0) await db.insert(snapshotsMetadata).values(newSnapshots);
        // delete
        if (deleteSnapshots.length > 0) await db.delete(snapshotsMetadata)
            .where(inArray(
                snapshotsMetadata.id,
                deleteSnapshots.map(dbResult => dbResult.id)
            ));
        logger.debug(`index repo ${this.repo.name} success`);
    }

    public async check() {
        if (this.repo.repositoryStatus !== 'Active') return;
        // insert execution as pending
        const newExecution = await this.createExecution(commandType.check);
        // add to queue
        const task = await this.startJob(
            newExecution,
            (log, err, signal) =>
                this.repoClient.check(log, err, this.repo.checkPercentage, newExecution.uuid, signal),
        )
        if (!task) return;
        // update repo as corrupt if check failed
        const result = await task.result;
        if (!result.success) return;
        if (result.result!.numErrors > 0) {
            const updatedResult = await db.update(repository)
                .set({ repositoryStatus: 'Corrupt' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(updatedResult[0]);
            logger.debug(`check repo ${this.repo.name} with num error > 0`)
            return;
        }
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
        logger.debug(`repo ${this.repo.name} prune at ${this.repo.nextPruneAt} success`)
    }

    private async startJob<T> (
        newExecution: UpdateExecutionSchema,
        job: (log: string, err: string, signal: AbortSignal) => Task<ResticResult<T>>,
        isExclusive: boolean = true,
        lockRemote?: () => Promise<void>,
        unLockRemote?: () => Promise<void>,
    ): Promise<Task<ResticResult<T>> | undefined> {
        const controller = new AbortController();
        const { signal } = controller;
        this.jobMap.set(newExecution.id, { status: 'waiting', controller: controller });
        const onAbort = async () => {
            logger.warn(`Execution ${newExecution.id} was aborted.`);
            await this.cancelExecution(newExecution.id);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            return this.globalQueue.add(async () => {
                // locking
                if (isExclusive) await this.writeLock();
                else await this.readLock();
                if (lockRemote) await lockRemote();
                try {
                    // create log file and start
                    const { logFile, errorFile } = await FileManager.createLogFile();
                    const task = job(logFile, errorFile, signal)
                    this.jobMap.set(newExecution.id, {
                       status: 'running',
                       controller: controller,
                       task: task
                    });
                    // update execution as running
                    await this.updateToRunning(newExecution, task);
                    // await the task finish then update final result
                    const result = await task.result;
                    // Only finalize if we weren't aborted
                    if (!signal.aborted) {
                        await this.finalizeExecution(newExecution, result);
                    }
                    return task;
                } catch (e) {
                    // Only throw if this wasn't a planned abort
                    if (!signal.aborted) {
                        throw new Error(`execution ${newExecution.id} failed: ${String(e)}`);
                    }
                } finally {
                    // unlocking
                    if (isExclusive) await this.writeUnlock();
                    else await this.readUnlock();
                    if (unLockRemote) await unLockRemote();
                }
            }, { signal: signal });
        } catch (error) {
            // This catch only handles unexpected queue/setup errors
            if (!(error instanceof DOMException) && !signal.aborted) {
                logger.error(error, `error during execution ${newExecution.id} setup`);
                await this.cancelExecution(newExecution.id);
            }
            return undefined;
        } finally {
            signal.removeEventListener('abort', onAbort);
            this.jobMap.delete(newExecution.id);
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
                if (isExclusive) {
                    await this.writeLock(initialIntervalMs, 1);
                } else {
                    await this.readLock(initialIntervalMs, 1);
                }
                // 1. Execute the function
                const result = await func();
                // 3. Check for success
                if (result.success) {
                    return {
                        success: true,
                        result: result.result,
                        attempts: attempt + 1
                    };
                }
                if (result.error.exitCode !== ExitCode.FailedToLockRepository) {
                    return {
                        success: false,
                        error: result.error,
                        attempts: attempt + 1
                    }
                } else {
                    // 4. Handle Failure
                    lastError = result.error;
                    // If we have retries left, wait before next attempt
                    if (attempt < retryCount) {
                        const delay = initialIntervalMs * (attempt + 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            } catch (error) {
                lastError = error;
            } finally {
                if (isExclusive) {
                    await this.writeUnlock();
                } else {
                    await this.readUnlock();
                }
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
        await db.update(execution).set({
            exitCode: result.success ? result.rawResult.exitCode : result.error.exitCode,
            finishedAt: Date.now(),
            executeStatus: result.success ? 'success' : 'fail'
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

    public async readLock(
        intervalMs?: number,
        maxRetry?: number,
    ) {
        await pWaitFor(() => {
            if (this.reader >= 0) {
                this.reader++;
                return true;
            } else {
                return false;
            }
        }, { interval: intervalMs || 10 * 1000, timeout: maxRetry ? maxRetry * (intervalMs || 10 * 1000) : 60 * 60 * 1000 }); // default wait 1 hours
    }

    public async readUnlock() {
        this.reader--;
    }

    private async writeLock(
        intervalMs?: number,
        maxRetry?: number,
    ) {
        await pWaitFor(() => {
            if (this.reader === 0) {
                this.reader = -1;
                return true;
            } else {
                return false;
            }
        }, { interval: intervalMs || 10 * 1000, timeout: maxRetry ? maxRetry * (intervalMs || 10 * 1000) : 60 * 60 * 1000 });
    }

    private async writeUnlock() {
        this.reader = 0;
    }
}

type RetryResult<T> =
    | { success: true; result: T; attempts: number }
    | { success: false; error: ResticError; attempts: number };

type ResticJob =
    | { status: 'waiting'; controller: AbortController }
    | { status: 'running'; controller: AbortController; task: Task<ResticResult<any>> };