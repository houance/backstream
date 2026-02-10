import {RepositoryClient} from "../restic";
import PQueue from "p-queue";
import {
    repository,
    setting,
    updateRepositorySchema,
    updateSettingSchema,
    type UpdateRepositorySchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";


interface Client {
    repo: UpdateRepositorySchema;
    repoClient: RepositoryClient,
    workerQueue: PQueue,
    cleanupQueue: PQueue,
}

export class BackupManager {
    private readonly clientMap: Map<number, Client>;
    private readonly setting: UpdateSystemSettingSchema

    private constructor(clientMap:Map<number, Client> ,setting: UpdateSystemSettingSchema) {
        this.clientMap = clientMap;
        this.setting = setting;
    }

    public static async create() {
        // get setting from db
        const systemSetting = await db.select().from(setting).orderBy(setting.id).limit(1)
        if (!systemSetting) throw new Error("get setting failed");
        const validateSetting = updateSettingSchema.parse(systemSetting);
        // get all repo from db
        const allRepo = await db.select().from(repository);
        if (!allRepo) throw new Error("get all repo failed");
        const clientMap = new Map<number, Client>();
        // init client from all repo
        allRepo.forEach(repository => {
            // convert to validate zod schema
            const validated = updateRepositorySchema.parse(repository);
            // init repo client
            const repoClient = new RepositoryClient(
                validated.path,
                validated.password,
                validated.repositoryType,
                validated.certification
            )
            // add client to map
            clientMap.set(validated.id, {
                repo: validated,
                repoClient: repoClient,
                workerQueue: new PQueue({ concurrency: 3 }),
                cleanupQueue: new PQueue({ concurrency: 1 }),
            })
        })
        return new BackupManager(clientMap, validateSetting)
    }

    public addClient(repo: UpdateRepositorySchema) {
        // init repo client
        const repoClient = new RepositoryClient(
            repo.path,
            repo.password,
            repo.repositoryType,
            repo.certification
        )
        this.clientMap.set(repo.id, {
            repo: repo,
            repoClient: repoClient,
            workerQueue: new PQueue({ concurrency: 3 }),
            cleanupQueue: new PQueue({ concurrency: 1 }),
        });
    }
}