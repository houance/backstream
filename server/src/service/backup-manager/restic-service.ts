import {
    commandType,
    type CommandType,
    execution, type InsertSnapshotsMetadataSchema, insertSnapshotsMetadataSchema,
    repository, snapshotsMetadata, type UpdateBackupTargetSchema, updateExecutionSchema,
    type UpdateExecutionSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema, type UpdateSnapshotsMetadataSchema, updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {RepositoryClient, ResticResult, type Task} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq, and, inArray} from "drizzle-orm";
import {existsSync} from "node:fs";
import { mkdir, writeFile } from 'node:fs/promises';
import os from "node:os";
import path from "node:path";
import pWaitFor from "p-wait-for";

export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private reader = 0; // simple rw lock
    private readonly runningJob: Map<number, Task<ResticResult<any>>> // <executionId, Task>

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
        // init queue
        this.globalQueue = queue
    }

    public async isConnected() {
        if (this.repo.repositoryStatus === "Corrupt") return;
        // queue's job is running === repo is connected
        if (this.reader !== 0) {
            const updatedResult = await db.update(repository)
                .set({ repositoryStatus: "Active" })
                .where(eq(repository.id, this.repo.id))
                .returning()
            this.repo = updateRepositorySchema.parse(updatedResult[0]);
            return;
        }
        // check if repo connected
        const result = await this.repoClient.isRepoExist();
        const repoConn = result.success && result.result!
        const updatedResult = await db.update(repository)
            .set({ repositoryStatus: repoConn ? 'Active' : 'Disconnected' })
            .where(eq(repository.id, this.repo.id))
            .returning();
        this.repo = updateRepositorySchema.parse(updatedResult[0]);
    }

    public async backup(path: string, target: UpdateBackupTargetSchema) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const newExecution = await this.createExecution(commandType.backup);
        try {
            const forgetResult = await this.checkLockAndTry(() => this.repoClient.forgetByPathWithPolicy(path, target.retentionPolicy))
            if (!forgetResult.success) console.warn(`forget ${path} at ${this.repo.name} fail: ${forgetResult.errorMsg}`)
        } catch (error) {
            console.warn(`forget ${path} at ${this.repo.name} fail: ${String(error)}`)
        }
        // add to queue
        const task = await this.startJob(
            newExecution,
            (log, err) =>
                this.repoClient.backup(path, log, err, newExecution.uuid)
        )
        const result = await task.result
        if (!result.success || result.result?.snapshotId === undefined || result.result.snapshotId === null) return;
        // index snapshots
        await this.indexSnapshots(path);
        // update set execution id
        await db.update(snapshotsMetadata)
            .set({ executionId: newExecution.id })
            .where(eq(snapshotsMetadata.snapshotId, result.result.snapshotId));
    }

    public async indexSnapshots(path?: string) {
        if (this.repo.repositoryStatus !== 'Active') return;
        const result = await this.checkLockAndTry(() => this.repoClient.getSnapshots(path))
        if (!result.success) {
            console.warn(`indexSnapshots ${path} wrong`);
            return;
        }
        if (result.result?.length === 0) return;
        const resticSnapshots = result.result!;
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
        resticSnapshots.forEach((snapshot) => {
            let hit = false;
            validatedDbResult.forEach((dbResult) => {
                if (snapshot.id === dbResult.snapshotId) {
                    hit = true;
                    return ;
                }
            })
            if (!hit) {
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
                }
                newSnapshots.push(insertSnapshotsMetadataSchema.parse(tmp))
            }
        })
        const deleteSnapshots: UpdateSnapshotsMetadataSchema[] = [];
        validatedDbResult.forEach((dbResult) => {
            let hit = false;
            resticSnapshots.forEach((snapshot) => {
                if (dbResult.snapshotId === snapshot.id) {
                    hit = true;
                    return;
                }
            })
            if (!hit) deleteSnapshots.push(dbResult);
        })
        // create
        await db.insert(snapshotsMetadata).values(newSnapshots);
        // delete
        await db.delete(snapshotsMetadata)
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
    ): Promise<Task<ResticResult<T>>> {
        return this.globalQueue.add(async () => {
            if (isExclusive) {
                await this.writeLock();
            } else {
                await this.readLock();
            }
            try {
                // create log file and start
                const { logFile, errorFile } = await this.createLogFile(null, newExecution);
                const task = await this.checkLockAndTry(() => job(logFile, errorFile))
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
                this.runningJob.delete(newExecution.id);
            }
        })
    }

    private async checkLockAndTry<T>(
        func: () => Promise<T> | T,
        initialIntervalMs: number = 5000,
        retryCount: number = 3
    ): Promise<T> {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            // 1. Check if the repository is locked
            try {
                const isLocked = await this.isRepoLocked();
                if (!isLocked) {
                    return func();
                } else {
                    console.warn(`Attempt ${attempt + 1}: Repository is locked.`);
                }
            } catch (e) {
                console.warn(`Attempt ${attempt + 1}: ${String(e)}`);
            }
            // 2. If we have retries left, calculate the backoff and wait
            if (attempt < retryCount) {
                // Formula: base * 2^attempt + jitter
                // Adds random 0-100ms jitter to prevent "thundering herd"
                const backoffDelay = (initialIntervalMs * Math.pow(2, attempt)) + (Math.random() * 100);

                console.debug(`Retrying in ${Math.round(backoffDelay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }

        throw new Error(`Execution failed after ${retryCount + 1} attempts (Repo locked or function error).`);
    }

    private async isRepoLocked(): Promise<boolean> {
        // check if outside restic command lock the repo
        const getLocksResult = await this.repoClient.getRepoLock();
        if (!getLocksResult.success) throw new Error(`Get repository locks failed: ${String(getLocksResult.errorMsg)}`);
        return getLocksResult.result!.exclusive
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

    private async createExecution(commandType: CommandType): Promise<UpdateExecutionSchema> {
        const [row] = await db.insert(execution).values({
            commandType: commandType,
            executeStatus: "pending",
            scheduledAt: Date.now(),
            uuid: crypto.randomUUID(),
            repositoryId: this.repo.id
        }).returning();
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
            exitCode: result.rawExecResult.exitCode,
            finishedAt: Date.now(),
            executeStatus: result.success ? 'success' : 'fail'
        }).where(eq(execution.id, exec.id));
    }

    private async readLock() {
        await pWaitFor(() => {
            if (this.reader >= 0) {
                this.reader++;
                return true;
            } else {
                return false;
            }
        }, { interval: 5000 })
    }

    private async readUnlock() {
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