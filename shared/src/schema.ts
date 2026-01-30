import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type {ResticCert} from "./index";

// 1. Repository Table
export const repository = sqliteTable("repository_table", {
    id: integer("repository_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    repositoryType: text("repository_type").notNull().default("Local"),
    usage: integer("size").default(0),
    capacity: integer("capacity").notNull().default(0),
    certification: text("certification", { mode: "json" })
        .$type<ResticCert>()
        .notNull(),
    repositoryStatus: text("repository_status").notNull().default("Active"),
});

// 2. Strategy Table
export const strategy = sqliteTable("strategy_table", {
    id: integer("strategy_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    dataSource: text("data_source").notNull(),
    dataSourceSize: integer("data_source_size").notNull().default(0),
    strategyType: text("strategy_type", {enum: ["3-2-1", "localCopy"]}).notNull().default("3-2-1"),
});

// 3. Backup Target Table (Links strategy to Repository)
export const backupTargets = sqliteTable("backup_target_table", {
    id: integer("backup_target_id").primaryKey({ autoIncrement: true }),
    backupStrategyId: integer("backup_strategy_id").references(() => strategy.id),
    repositoryId: integer("repository_id").references(() => repository.id),
    retentionPolicy: text("retention_policy", { mode: "json"}),
    schedulePolicy: text("schedule_policy"),
    index: integer("index").notNull().default(1),
    target_type: text("target_type"),
});

// 4. Snapshots Metadata Table
export const snapshotsMetadata = sqliteTable("snapshots_metadata_table", {
    id: integer("snapshot_db_id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").references(() => repository.id),
    path: text("path"),
    snapshotId: text("snapshot_id").notNull(), // The ID from the backup engine
    hostname: text("hostname"),
    username: text("username"),
    backupStart: integer("backup_start", { mode: "timestamp" }),
    backupEnd: integer("backup_end", { mode: "timestamp" }),
    totalBytes: integer("total_bytes"),
});

// 5. Execution Table
export const execution = sqliteTable("execution_table", {
    id: integer("execution_id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid"),
    logFile: text("log_file"),
    errorFile: text("error_file"),
    commandType: text("command_type", { enum: ["backup", "prune", "check", "restore", "copy"]}),
    fullCommand: text("full_command"),
    exitCode: integer("exit_code"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    executeStatus: text("execute_status", { enum: ["success", "fail", "running"] }),
    repositoryId: integer("repository_id").references(() => repository.id),
    strategyId: integer("strategy_id").references(() => strategy.id),
    backupTargetId: integer("backup_target_id").references(() => backupTargets.id),
})

// For selecting (reading)
export type Repository = typeof repository.$inferSelect;
export type Strategy = typeof strategy.$inferSelect;
export type BackupTarget = typeof backupTargets.$inferSelect;
export type SnapshotMetadata = typeof snapshotsMetadata.$inferSelect;
export type Execution = typeof execution.$inferSelect;

// For inserting (creating) - These allow 'id' to be optional/omitted
export type NewRepository = typeof repository.$inferInsert;
export type NewStrategy = typeof strategy.$inferInsert;
export type NewBackupTarget = typeof backupTargets.$inferInsert;
export type NewSnapshotMetadata = typeof snapshotsMetadata.$inferInsert;
export type NewExecution = typeof execution.$inferInsert;