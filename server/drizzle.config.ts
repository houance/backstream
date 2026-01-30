// server/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    // Path relative to THIS file
    schema: "../shared/src/schema.ts",
    out: "./drizzle", // Migrations will go into server/drizzle/
    dialect: "sqlite",
    dbCredentials: {
        url: "sqlite.db", // DB file will be created in server/sqlite.db
    },
});
