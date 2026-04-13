import { db } from "../db";
import { setting, type UpdateSystemSettingSchema, updateSystemSettingSchema } from "@backstream/shared";
import { desc, eq } from "drizzle-orm";

class Client {
    private cache!: UpdateSystemSettingSchema;
    private static instance: Client;

    // Private constructor prevents 'new Client()' outside this file
    private constructor() {}

    // Initialize the singleton instance
    static async init() {
        if (!Client.instance) {
            const [row] = await db.select().from(setting).orderBy(desc(setting.id)).limit(1);
            if (!row) throw new Error(`system setting not found`);

            Client.instance = new Client();
            Client.instance.cache = updateSystemSettingSchema.parse(row);
        }
        return Client.instance;
    }

    get() {
        return this.cache;
    }

    async update(newData: UpdateSystemSettingSchema) {
        const [dbResult] = await db.update(setting)
            .set(newData)
            .where(eq(setting.id, newData.id))
            .returning();

        this.cache = updateSystemSettingSchema.parse(dbResult);
        return this.cache;
    }
}

// Export a single constant instance
export const client = await Client.init();