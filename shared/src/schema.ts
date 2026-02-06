import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import {relations} from "drizzle-orm";

// 1. Repository Table
export const repository = sqliteTable("repository_table", {
    id: integer("repository_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    password: text("password").notNull(),
    repositoryType: text("repository_type").notNull(),
    usage: integer("size").notNull(),
    capacity: integer("capacity").notNull(),
    certification: text("certification", { mode: "json" }),
    repositoryStatus: text("repository_status").notNull(),
});

// 2. Strategy Table
export const strategy = sqliteTable("strategy_table", {
    id: integer("strategy_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    hostname: text("hostname").notNull(),
    dataSource: text("data_source").notNull(),
    dataSourceSize: integer("data_source_size").notNull(),
    strategyType: text("strategy_type").notNull(),
});

// 3. Backup Target Table (Links strategy to Repository)
export const backupTarget = sqliteTable("backup_target_table", {
    id: integer("backup_target_id").primaryKey({ autoIncrement: true }),
    backupStrategyId: integer("backup_strategy_id").references(() => strategy.id).notNull(),
    repositoryId: integer("repository_id").references(() => repository.id).notNull(),
    retentionPolicy: text("retention_policy", { mode: "json"}).notNull(),
    schedulePolicy: text("schedule_policy").notNull(),
    index: integer("index").notNull(),
});

// 4. Snapshots Metadata Table
export const snapshotsMetadata = sqliteTable("snapshots_metadata_table", {
    id: integer("snapshot_db_id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").references(() => repository.id),
    path: text("path"),
    snapshotId: text("snapshot_id").notNull(), // The ID from the backup engine
    hostname: text("hostname"),
    username: text("username"),
    backupStart: integer("backup_start"),
    backupEnd: integer("backup_end"),
    totalBytes: integer("total_bytes"),
    snapshotStatus: text().notNull(),
});

// 5. Execution Table
export const execution = sqliteTable("execution_table", {
    id: integer("execution_id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull(),
    logFile: text("log_file"),
    errorFile: text("error_file"),
    commandType: text("command_type", { enum: ["backup", "prune", "check", "restore", "copy"]}).notNull(),
    fullCommand: text("full_command"),
    exitCode: integer("exit_code"),
    scheduledAt: integer("scheduled_at"),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    executeStatus: text("execute_status", { enum: ["success", "fail", "running", "schedule"] }).notNull(),
    repositoryId: integer("repository_id").references(() => repository.id),
    strategyId: integer("strategy_id").references(() => strategy.id),
    backupTargetId: integer("backup_target_id").references(() => backupTarget.id),
})

// 6. System Settings Table
export const setting = sqliteTable("system_setting", {
    id: integer("setting_id").primaryKey({ autoIncrement: true }),
    ioPriority: text("io_priority").notNull(),
    minDiskSpaceGB: integer("min_disk_space_gb").notNull(),
    email: text("email").notNull(),
    logRetentionDays: integer("log_retention_days").notNull(),
})

// strategy => many targets
export const strategyRelations = relations(strategy, ({ many }) => ({
    targets: many(backupTarget),
}));
// target => 1 strategy, 1 repository, many execution
export const backupTargetRelations = relations(backupTarget, ({ one, many }) => ({
    strategy: one(strategy, {
        fields: [backupTarget.backupStrategyId],
        references: [strategy.id],
    }),
    repository: one(repository, {
        fields: [backupTarget.repositoryId],
        references: [repository.id],
    }),
    executions: many(execution),
}));
// execution => one target or one repository
export const executionRelations = relations(execution, ({ one }) => ({
    // Link to Backup Target (which then links to Strategy)
    target: one(backupTarget, {
        fields: [execution.backupTargetId],
        references: [backupTarget.id],
    }),
    // Link to Strategy directly (as defined in your table)
    strategy: one(strategy, {
        fields: [execution.strategyId],
        references: [strategy.id],
    }),
    // Link to Repository directly
    repository: one(repository, {
        fields: [execution.repositoryId],
        references: [repository.id],
    }),
}));