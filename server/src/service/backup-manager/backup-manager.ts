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
import {eq} from "drizzle-orm";
import {Client} from "./client";

export class BackupManager {
    private readonly clientMap: Map<number, Client>;
    private readonly setting: UpdateSystemSettingSchema
    private isRunning = true;

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
            // add client to map
            clientMap.set(validated.id, new Client(validated));
        })
        // start repo connect heart beat
        const backupManager = new BackupManager(clientMap, validateSetting);
        void backupManager.startConnTest()
        return backupManager;
    }

    public addClient(repo: UpdateRepositorySchema) {
        this.clientMap.set(repo.id, new Client(repo));
    }

    private async startConnTest() {
        while (this.isRunning) {
            const checks = Array.from(this.clientMap.values()).map(c => {c.isConnected()});
            await Promise.all(checks)
            // runs every 10 sec
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}