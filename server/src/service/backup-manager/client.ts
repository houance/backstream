import {repository, updateRepositorySchema, type UpdateRepositorySchema} from "@backstream/shared";
import {RepositoryClient} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq} from "drizzle-orm";

export class Client {
    private repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private workerQueue: PQueue; // backup, copyTo(current repo is target)
    private cleanupQueue: PQueue; // prune, check

    public constructor(repo: UpdateRepositorySchema) {
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
        this.workerQueue = new PQueue({ concurrency: 3 });
        this.cleanupQueue = new PQueue({ concurrency: 1 });
    }

    public async isConnected() {
        // queue's job is running === repo is connected
        if (this.cleanupQueue.pending !== 0 || this.workerQueue.pending !== 0) {
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

    private async checkLockAndTry<T>(
        func: () => Promise<T> | T,
        initialIntervalMs: number,
        retryCount: number = 3
    ): Promise<T> {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            // 1. Check if the repository is locked (Placeholder)
            const isLocked = await this.isRepoLocked();

            if (!isLocked) {
                try {
                    return await func();
                } catch (error) {
                    console.warn(`Attempt ${attempt + 1} failed with error:`, error);
                }
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
        if (this.cleanupQueue.pending !== 0) return true // clean up is exclusive lock
        if (this.workerQueue.pending !== 0) return false // worker is shared lock
        // check if outside restic command lock the repo
        const getLocksResult = await this.repoClient.getRepoLock();
        if (!getLocksResult.success) throw new Error(`Get repository locks failed: ${getLocksResult.errorMsg}`);
        return getLocksResult.result!.exclusive
    }
}