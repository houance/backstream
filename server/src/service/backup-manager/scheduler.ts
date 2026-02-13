import {
    backupTarget,
    repository,
    setting, type UpdateBackupTargetSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    updateSettingSchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";
import {BackupClient} from "./backup-client";
import PQueue from "p-queue";
import {type Task} from "../restic";

export class Scheduler {
    private readonly clientMap: Map<number, BackupClient>;
    private readonly setting: UpdateSystemSettingSchema
    private isRunning = true;
    private readonly globalQueue: PQueue; // all working job
    private readonly runningJob: Map<number, Task<any>>

    private constructor(clientMap:Map<number, BackupClient> , setting: UpdateSystemSettingSchema, globalQueue: PQueue) {
        this.clientMap = clientMap;
        this.setting = setting;
        this.globalQueue = globalQueue;
        this.runningJob = new Map<number, Task<any>>();
        // start repo heart beat schedule
        void this.checkRepoConnected();
        // init backup schedule
        void this.initSchedule();
    }

    public static async create(concurrency: number = 5): Promise<Scheduler> {
        // init queue
        const globalQueue = new PQueue({ concurrency });
        // get setting from db
        const systemSetting = await db.select().from(setting).orderBy(setting.id).limit(1)
        if (!systemSetting) throw new Error("get setting failed");
        const validateSetting = updateSettingSchema.parse(systemSetting);
        // get all repo from db
        const allRepo = await db.select().from(repository);
        if (!allRepo) throw new Error("get all repo failed");
        const clientMap = new Map<number, BackupClient>();
        // init client from all repo
        allRepo.forEach(repository => {
            // convert to validate zod schema
            const validated = updateRepositorySchema.parse(repository);
            // add client to map
            clientMap.set(validated.id, new BackupClient(validated, globalQueue));
        })
        return new Scheduler(clientMap, validateSetting, globalQueue);
    }

    private async checkRepoConnected() {
        while (this.isRunning) {
            const checks = Array.from(this.clientMap.values()).map(c => {c.isConnected()});
            await Promise.all(checks)
            // runs every 10 sec
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    private async initSchedule() {
        // get all backup target with latest two execution(order by scheduledAt)
        const backupTargets = await db.query.strategy.findMany({
            with: {
                targets: {
                    with: {
                        executions: {
                            orderBy: (execution, { desc }) => [desc(execution.scheduledAt)],
                            limit: 2
                        }
                    }
                }
            }
        });
        if (!backupTargets) throw new Error("get all backup target failed");
        // loop over targets for backup schedule

    }

    public async addRepoSchedule(repository: UpdateRepositorySchema) {

    }

    public async addBackupSchedule(backupTarget: UpdateBackupTargetSchema) {

    }


    public addClient(repo: UpdateRepositorySchema) {
        this.clientMap.set(repo.id, new BackupClient(repo, this.globalQueue));
    }
}