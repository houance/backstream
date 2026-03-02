import {
    commandType,
    type CommandType,
    execution, type InsertExecutionSchema, type InsertSnapshotsMetadataSchema, insertSnapshotsMetadataSchema,
    repository, RepoType, snapshotsMetadata, type UpdateBackupTargetSchema, updateExecutionSchema,
    type UpdateExecutionSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema, type UpdateSnapshotsMetadataSchema, updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {
    ExitCode,
    RepositoryClient,
    ResticError,
    type ResticResult,
    type Snapshot,
    type Task
} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq, and, inArray} from "drizzle-orm";
import {existsSync} from "node:fs";
import { mkdir, writeFile } from 'node:fs/promises';
import os from "node:os";
import path from "node:path";
import pWaitFor from "p-wait-for";
import {RcloneClient} from "../rclone";

export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private reader = 0; // simple rw lock
    private readonly runningJob: Map<number, Task<ResticResult<any>>> // <executionId, Task>
    private readonly rcloneClient: RcloneClient | null;

    public constructor(repo: UpdateRepositorySchema, queue: PQueue) {
        // init map
        this.runningJob = new Map();
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

    public static async create(repo: UpdateRepositorySchema, queue: PQueue): Promise<ResticService> {
        const resticService = new ResticService(repo, queue);
        // create repo if not exist
        await resticService.initRepo();
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
            const dbResult = await db.update(repository)
                .set({ repositoryStatus: 'Disconnected' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult[0]);
            return;
        }
        // repo 已创建
        if (isRepoExists.result) {
            const dbResult = await db.update(repository)
                .set({ repositoryStatus: 'Active' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult[0]);
            return;
        }
        // repo 未创建
        const result = await this.repoClient.createRepo();
        if (result.success) {
            const dbResult = await db.update(repository)
                .set({ repositoryStatus: 'Active' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult[0]);
        } else {
            // 创建失败
            const dbResult = await db.update(repository)
                .set({ repositoryStatus: 'Corrupt' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(dbResult[0]);
        }
    }

    public getRunningJob(execution: UpdateExecutionSchema): Task<ResticResult<any>> | null {
        if (!this.runningJob.has(execution.id)) return null;
        return this.runningJob.get(execution.id)!;
    }

    public async stopAllRunningJob() {
        for (const [key, value] of this.runningJob) {
            value.cancel();
            await this.cancelExecution(key)
        }
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
        if (this.rcloneClient !== null) {
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
            3000
        )
    }

    public async copyTo(
        path: string,
        targetService: ResticService,
        target: UpdateBackupTargetSchema,
    ) {
        if (this.repo.repositoryStatus !== 'Active' || targetService.repo.repositoryStatus !== 'Active') return;
        // run remote retention policy against local in dry run mode, get what snapshot should be copy
        let keepSnapshotIds: string[] = [];
        const retryResult = await this.retryOnLock(() =>
            this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy));
        if (!retryResult.success) {
            console.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult.error.toString()}`);
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
        const result = await task.result
        if (!result.success) return;
        console.log(`copyTo ${targetService.repo.name} success`)
        // run remote retention policy against remote for cleaning up old data
        const retryResult2 = await targetService.retryOnLock(() =>
            targetService.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy));
        if (!retryResult2.success) console.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult2.error.toString()}`)
        // remote repo index snapshot
        await targetService.indexSnapshots(path);
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
        const result = await task.result
        if (!result.success || result.result.snapshotId === undefined || result.result.snapshotId === null) return;
        console.log(`backup ${this.repo.name} success`)
        // index snapshots
        await this.indexSnapshots(path);
        // update set execution id
        await db.update(snapshotsMetadata)
            .set({ executionId: newExecution.id })
            .where(eq(snapshotsMetadata.snapshotId, result.result.snapshotId));
        // forget old data
        const retryResult = await this.retryOnLock(() =>
            this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy));
        if (!retryResult.success) console.warn(`forget ${path} at ${this.repo.name} fail: ${retryResult.error.toString()}`);
    }

    public async indexSnapshots(path?: string) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const retryResult = await this.retryOnLock(() => this.repoClient.getSnapshots(path))
        if (!retryResult.success) {
            console.warn(`indexSnapshots ${path} wrong. ${retryResult.error.toString()}`);
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
        // update repo as corrupt if check failed
        const result = await task.result;
        if (!result.success) return;
        if (result.result!.numErrors > 0) {
            const updatedResult = await db.update(repository)
                .set({ repositoryStatus: 'Corrupt' })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(updatedResult[0]);
            console.info(`check repo ${this.repo.name} with num error > 0`)
            return;
        }
        console.info(`check repo ${this.repo.name} with num error = 0`)
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
        const result = await task.result;
        if (!result.success) return;
        console.info(`repo ${this.repo.name} prune at ${this.repo.nextPruneAt} success`)
    }

    private async startJob<T> (
        newExecution: UpdateExecutionSchema,
        job: (log: string, err: string) => Task<ResticResult<T>>,
        isExclusive: boolean = true,
        lockRemote?: () => Promise<void>,
        unLockRemote?: () => Promise<void>,
    ): Promise<Task<ResticResult<T>>> {
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
                const { logFile, errorFile } = await this.createLogFile(null, newExecution);
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
        })
    }

    private async retryOnLock<T>(
        func: () => Promise<ResticResult<T>>,
        initialIntervalMs: number = 5000,
        retryCount: number = 3
    ): Promise<RetryResult<T>> {
        let lastError: ResticError | undefined;
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            // 1. Execute the function
            // add random wait time for restic to clean previous lock
            await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));
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
                    console.debug(`Attempt ${attempt + 1} failed. Error: ${lastError.toString()}, Retrying...`)
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        return {
            success: false,
            error: lastError!,
            attempts: retryCount + 1
        };
    }

    private async createLogFile(baseDirPath: string | null | undefined, execution: UpdateExecutionSchema) {
        // 1. Determine Root (Default to system temp)
        const root = baseDirPath && existsSync(baseDirPath)
            ? baseDirPath
            : os.tmpdir();
        // log folder
        const logFolder = path.join(root, `backstream-${execution.uuid}`);
        // create folder
        await mkdir(logFolder, { recursive: true });
        // 3. Create Files
        const logFile = path.join(logFolder, `stdout.log`);
        const errorFile = path.join(logFolder, `stderr.log`);
        await writeFile(logFile, '');
        await writeFile(errorFile, '');

        return {
            logFile,
            errorFile,
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
            value.strategyId = target.backupStrategyId;
        } else {
            value.repositoryId = this.repo.id
        }
        const [row] = await db.insert(execution).values(value).returning();
        return updateExecutionSchema.parse(row);
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

    private async cancelExecution(execId: number): Promise<void> {
        await db.update(execution).set({ executeStatus: "cancel" }).where(eq(execution.id, execId));
    }

    public async readLock() {
        await pWaitFor(() => {
            if (this.reader >= 0) {
                this.reader++;
                return true;
            } else {
                return false;
            }
        }, { interval: 5000 })
    }

    public async readUnlock() {
        this.reader--;
    }

    private async writeLock() {
        await pWaitFor(() => {
            if (this.reader === 0) {
                this.reader = -1;
                return true;
            } else {
                return false;
            }
        }, { interval: 5000 })
    }

    private async writeUnlock() {
        this.reader = 0;
    }
}

type RetryResult<T> =
    | { success: true; result: T; attempts: number }
    | { success: false; error: ResticError; attempts: number };