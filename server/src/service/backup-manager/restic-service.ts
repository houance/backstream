import {
    commandType,
    type CommandType,
    execution,
    repository, updateExecutionSchema,
    type UpdateExecutionSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema
} from "@backstream/shared";
import {RepositoryClient, ResticResult, type Task} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq} from "drizzle-orm";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

export class ResticService {
    public repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private globalQueue: PQueue; // global concurrency limit
    private workerQueue: PQueue; // actual working queue
    private readonly runningJob: Map<number, Task<any>> // <executionId, Task>

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
        this.workerQueue = new PQueue({ concurrency: 1 });
    }

    public async isConnected() {
        // queue's job is running === repo is connected
        if (this.workerQueue.pending !== 0) {
            return true;
        }
        // check if repo connected
        const result = await this.repoClient.isRepoExist();
        const repoConn = result.success && result.result!
        const updatedResult = await db.update(repository)
            .set({ repositoryStatus: repoConn ? 'Active' : 'Disconnected' })
            .where(eq(repository.id, this.repo.id))
            .returning();
        this.repo = updateRepositorySchema.parse(updatedResult);
    }

    public async check() {
        // insert execution as pending
        const newExecution = await this.createExecution(commandType.check);
        // add to queue
        void this.addJob(
            newExecution,
            (log, err) =>
                this.repoClient.check(log, err, this.repo.checkPercentage),
        )
    }

    public async prune() {
        // insert execution as pending
        const newExecution = await this.createExecution(commandType.prune);
        // add to queue
        void this.addJob(
            newExecution,
            (log, err) => this.repoClient.prune(log, err)
        )
    }

    private async addJob<T> (
        newExecution: UpdateExecutionSchema,
        jobFunc: (log: string, err: string) => Task<ResticResult<T>>,
    ) {
        // todo: rw lock
        return this.workerQueue.add(async () => {
            // pause worker queue
            this.workerQueue.pause();
            // get global queue slot to operate
            return this.globalQueue.add(async () => {
                let task = null;
                try {
                    // create log file and start
                    const { logFile, errorFile } = this.createLogFile(null, newExecution);
                    task = await this.checkLockAndTry(() => jobFunc(logFile, errorFile))
                    this.runningJob.set(newExecution.id, task)
                } catch (e) {
                    this.runningJob.delete(newExecution.id);
                    await this.updateToFail(newExecution);
                    this.workerQueue.start();
                    return;
                }
                try {
                    // update execution as running
                    await this.updateToRunning(newExecution, task)
                    // await the task finish
                    await task.result;
                    // update final result
                    await this.finalizeExecution(newExecution, await task.result);
                } catch (e) {
                    console.error(e);
                } finally {
                    this.workerQueue.start();
                    this.runningJob.delete(newExecution.id);
                }
            })
        })
    }

    private async checkLockAndTry<T>(
        func: () => Promise<T> | T,
        initialIntervalMs: number = 5000,
        retryCount: number = 3
    ): Promise<T> {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            // 1. Check if the repository is locked
            const isLocked = await this.isRepoLocked();
            if (!isLocked) {
                return func();
            } else {
                console.warn(`Attempt ${attempt + 1}: Repository is locked.`);
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
        if (!getLocksResult.success) throw new Error(`Get repository locks failed: ${getLocksResult.errorMsg}`);
        return getLocksResult.result!.exclusive
    }

    private createLogFile(baseDirPath: string | null | undefined, execution: UpdateExecutionSchema) {
        // 1. Determine Root (Default to system temp)
        const root = baseDirPath && existsSync(baseDirPath)
            ? baseDirPath
            : os.tmpdir();
        // Ensure the parent directory exists
        if (!existsSync(root)) {
            mkdirSync(root, { recursive: true });
        }
        // log folder
        const logFolder = path.join(root, `backstream-${execution.uuid}`);
        // 3. Create Files
        const logFile = path.join(logFolder, `stdout.log`);
        const errorFile = path.join(logFolder, `stderr.log`);
        writeFileSync(logFile, '');
        writeFileSync(errorFile, '');

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
            finishedAt: Date.now(),
            executeStatus: result.success ? 'success' : 'fail'
        }).where(eq(execution.id, exec.id));
    }

    private async updateToFail(exec: UpdateExecutionSchema) {
        await db.update(execution).set({
            finishedAt: Date.now(),
            executeStatus: "fail"
        }).where(eq(execution.id, exec.id))
    }
}