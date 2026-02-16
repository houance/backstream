import {
    execution,
    repository,
    setting, type UpdateBackupTargetSchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    updateSettingSchema,
    type UpdateSystemSettingSchema
} from "@backstream/shared";
import {db} from "../db";
import {ResticService} from "./restic-service";
import PQueue from "p-queue";
import {eq} from "drizzle-orm";
import {Cron} from "croner";

export class Scheduler {
    private readonly clientMap: Map<number, ResticService>;
    private readonly setting: UpdateSystemSettingSchema
    private isRunning = true;
    private readonly globalQueue: PQueue; // all working job
    private readonly triggers: Map<string, Cron> // <repoId:check/prune, Cron>

    private constructor(clientMap:Map<number, ResticService> , setting: UpdateSystemSettingSchema, globalQueue: PQueue) {
        this.clientMap = clientMap;
        this.triggers = new Map();
        this.setting = setting;
        this.globalQueue = globalQueue;
        // start repo heart beat schedule
        void this.scheduleRepoHeartBeat();
        void this.initRepoSchedule();
    }

    public static async create(concurrency: number = 5): Promise<Scheduler> {
        // init queue
        const globalQueue = new PQueue({ concurrency });
        // get setting from db
        const systemSetting = await db.select().from(setting).orderBy(setting.id).limit(1)
        if (!systemSetting) throw new Error("get setting failed");
        const validateSetting = updateSettingSchema.parse(systemSetting[0]);
        // get all repo from db
        const allRepo = await db.select().from(repository);
        if (!allRepo) throw new Error("get all repo failed");
        const clientMap = new Map<number, ResticService>();
        // init client from all repo
        allRepo.forEach(repository => {
            // convert to validate zod schema
            const validated = updateRepositorySchema.parse(repository);
            // add client to map
            clientMap.set(validated.id, new ResticService(validated, globalQueue));
        })
        // set all running execution to fail
        await db.update(execution)
            .set({ executeStatus: "fail", finishedAt: Date.now() })
            .where(eq(execution.executeStatus, "running"));
        // delete all pending execution for reschedule
        await db.delete(execution).where(eq(execution.executeStatus, "pending"));
        return new Scheduler(clientMap, validateSetting, globalQueue);
    }

    public getResticService(repository: UpdateRepositorySchema) {
        if (!this.clientMap.has(repository.id)) {
            this.clientMap.set(repository.id, new ResticService(repository, this.globalQueue));
        }
        return this.clientMap.get(repository.id)!;
    }

    private async scheduleRepoHeartBeat() {
        while (this.isRunning) {
            const checks = Array.from(this.clientMap.values()).map(c => {c.isConnected()});
            await Promise.all(checks)
            // runs every 10 sec
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    private async initRepoSchedule() {
        this.clientMap.forEach((client) => {
            const checkSchedule = client.repo.checkSchedule;
            const pruneSchedule = client.repo.pruneSchedule;
            if (checkSchedule !== "manual") {
                this.triggers.set(`${repository.id}:check`, new Cron(checkSchedule, { protect: true }, async () => {
                    await client.check()
                    await db.update(repository)
                        .set({ nextCheckAt: new Cron(checkSchedule).nextRun()!.getTime() })
                        .where(eq(repository.id, client.repo.id))
                }))
            }
            if (pruneSchedule !== "manual") {
                this.triggers.set(`${repository.id}:prune`, new Cron(pruneSchedule, { protect: true }, async () => {
                    await client.prune()
                    await db.update(repository)
                        .set({ nextPruneAt: new Cron(pruneSchedule).nextRun()!.getTime() })
                        .where(eq(repository.id, client.repo.id))
                }))
            }
        })
    }

    public async addBackupSchedule(backupTarget: UpdateBackupTargetSchema) {

    }


    public addClient(repo: UpdateRepositorySchema) {
        if (this.clientMap.has(repo.id)) return;
        this.clientMap.set(repo.id, new ResticService(repo, this.globalQueue));
    }
}