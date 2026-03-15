import {
    commandType,
    type CommandType,
    execution,
    type InsertExecutionSchema,
    type InsertSnapshotsMetadataSchema,
    insertSnapshotsMetadataSchema,
    repository,
    RepoType,
    type RestoreJobKey,
    type SnapshotFile,
    snapshotsMetadata,
    type UpdateBackupTargetSchema,
    updateExecutionSchema,
    type UpdateExecutionSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
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

export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private reader = 0; // simple rw lock
    private readonly waitingJob: Map<number, AbortController>; // <executionId, AbortController>
    private readonly runningJob: Map<number, Task<ResticResult<any>>> // <executionId, Task>
    private readonly rcloneClient: RcloneClient | null;
    private readonly restoreFiles: Map<string, string>; // <snapshotId:path, restore file path>
    private readonly zippingExecution: Set<number>; // <executionId>

    public constructor(repo: UpdateRepositorySchema, queue: PQueue) {
        // init map
        this.waitingJob = new Map();
        this.runningJob = new Map();
        this.restoreFiles = new Map();
        this.zippingExecution = new Set<number>();
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
        if (!this.runningJob.has(execution.id)) return null;
        return this.runningJob.get(execution.id)!;
    }

    public stopAllRunningJob() {
        this.runningJob.forEach((value) => value.cancel());
        this.runningJob.clear();
        this.waitingJob.forEach((value) => value.abort());
        this.waitingJob.clear();
    }

    public async stopPolicyRunningJob(targetId: number) {
        const dbResult = await db.select().from(execution)
            .where(and(
                eq(execution.backupTargetId, targetId),
                inArray(execution.executeStatus, ['running', 'pending'])
            ));
        if (!dbResult || dbResult.length === 0) return;
        dbResult.forEach(exec => {
            this.waitingJob.get(exec.id)?.abort();
            this.waitingJob.delete(exec.id);
            this.runningJob.get(exec.id)?.cancel();
            this.runningJob.delete(exec.id);
        })
    }

    public async updateStat() {
        if (this.repo.repositoryStatus === "Corrupt") return;
        let status: 'Active' | 'Disconnected';
        if (this.runningJob.size !== 0) {
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

    public getRestoreFile(key: RestoreJobKey): string {
        const restoreKey = `${key.snapshotId}:${key.path}`;
        return this.restoreFiles.get(restoreKey)!;
    }

    public checkRestoreStatus(key: RestoreJobKey): { status: 'running' | 'fail' | 'delete' | 'success' } {
        const restoreKey = `${key.snapshotId}:${key.path}`;
        const file = this.restoreFiles.get(restoreKey);
        if (file) return { status: 'success' };
        if (!key.executionId) return { status: 'delete' };
        // check if restoring
        const task = this.runningJob.get(key.executionId);
        if (task) return { status: 'running' };
        // check if zipping
        if (this.zippingExecution.has(key.executionId)) return { status: 'running' };
        // neither then return fail
        return { status: 'fail' }
    }

    // return
    public async restoreSnapshotFile(file: SnapshotFile): Promise<RestoreJobKey> {
        const restoreKey = `${file.snapshotId}:${file.path}`;
        // check if restore before
        const filePath = this.restoreFiles.get(restoreKey);
        if (filePath) return {
            snapshotId: file.snapshotId,
            path: file.path,
            repoId: this.repo.id,
        };
        const newExecution = await this.createExecution(commandType.restore);
        // start restore
        void (async () => {
            const dir = await FileManager.createTmpFolder();
            const task = await this.startJob(
                newExecution,
                (log, err) => this.repoClient.restoreFile(
                    file.snapshotId,
                    {name: file.name, path: file.path},
                    dir,
                    log,
                    err,
                    newExecution.uuid,
                ),
                false
            );
            if (!task) return;
            const result = await task.result;
            if (!result.success) return;
            const restoreFilePath = result.result;
            if (file.type !== 'dir') {
                this.restoreFiles.set(restoreKey, restoreFilePath);
            } else {
                // set zippingExecution
                this.zippingExecution.add(newExecution.id);
                // start zipping
                const result = await FileManager.zip(restoreFilePath, `backstream-${Date.now().toString()}`);
                if (result.success) {
                    this.restoreFiles.set(restoreKey, result.result);
                } else {
                    logger.warn(result.error, `restore ${file.name} fail`);
                }
                // remove zipping
                this.zippingExecution.delete(newExecution.id);
            }
        })();
        return {
            executionId: newExecution.id,
            snapshotId: file.snapshotId,
            path: file.path,
            repoId: this.repo.id,
        };
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
            (log, err) => this.repoClient.copyTo(
                    targetService.repoClient,
                    keepSnapshotIds,
                    log,
                    err,
                    newExecution.uuid
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
            (log, err) =>
                this.repoClient.backup(path, log, err, newExecution.uuid),
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
            (log, err) =>
                this.repoClient.check(log, err, this.repo.checkPercentage, newExecution.uuid),
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
            (log, err) => this.repoClient.prune(log, err, newExecution.uuid)
        )
        if (!task) return;
        const result = await task.result;
        if (!result.success) return;
        logger.debug(`repo ${this.repo.name} prune at ${this.repo.nextPruneAt} success`)
    }

    private async startJob<T> (
        newExecution: UpdateExecutionSchema,
        job: (log: string, err: string) => Task<ResticResult<T>>,
        isExclusive: boolean = true,
        lockRemote?: () => Promise<void>,
        unLockRemote?: () => Promise<void>,
    ): Promise<Task<ResticResult<T>> | undefined> {
        const controller = new AbortController();
        this.waitingJob.set(newExecution.id, controller);
        try {
            return this.globalQueue.add(async () => {
                if (isExclusive) {
                    await this.writeLock();
                } else {
                    await this.readLock();
                }
                if (lockRemote) {
                    await lockRemote();
                }
                try {
                    // create log file and start
                    const { logFile, errorFile } = await FileManager.createLogFile();
                    const task = job(logFile, errorFile)
                    this.runningJob.set(newExecution.id, task)
                    // update execution as running
                    await this.updateToRunning(newExecution, task)
                    // await the task finish then update final result
                    await this.finalizeExecution(newExecution, await task.result);
                    return task;
                } catch (e) {
                    throw new Error(`execution ${newExecution.id} failed: ${String(e)}`);
                } finally {
                    if (isExclusive) {
                        await this.writeUnlock();
                    } else {
                        await this.readUnlock();
                    }
                    if (unLockRemote) {
                        await unLockRemote();
                    }
                    this.runningJob.delete(newExecution.id);
                }
            }, { signal: controller.signal });
        } catch (error) {
            if (!(error instanceof DOMException)) logger.warn(error, `error before execution ${newExecution.id} added`);
            await this.cancelExecution(newExecution.id);
            return undefined;
        } finally {
            this.waitingJob.delete(newExecution.id);
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
        target?:UpdateBackupTargetSchema): Promise<UpdateExecutionSchema> {
        let value: InsertExecutionSchema = {
            commandType: commandType,
            executeStatus: "pending",
            scheduledAt: Date.now(),
            uuid: crypto.randomUUID(),
        };
        if (target) {
            value.backupTargetId = target.id;
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