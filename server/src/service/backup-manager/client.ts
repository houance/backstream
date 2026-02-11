import {repository, updateRepositorySchema, type UpdateRepositorySchema} from "@backstream/shared";
import {RepositoryClient} from "../restic";
import PQueue from "p-queue";
import {db} from "../db";
import {eq} from "drizzle-orm";

export class Client {
    private repo: UpdateRepositorySchema;
    private repoClient: RepositoryClient;
    private workerQueue: PQueue;
    private cleanupQueue: PQueue;

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
}