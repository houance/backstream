import {sqliteTable, text, integer, real, uniqueIndex, index} from "drizzle-orm/sqlite-core";
import {relations} from "drizzle-orm";

// Repository Table
export const repository = sqliteTable("repository_table", {
    id: integer("repository_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    path: text("path").notNull(),
    password: text("password").notNull(),
    repositoryType: text("repository_type").notNull(),
    usage: integer("usage").notNull(),
    capacity: integer("capacity"), // null for infinity or not retrievable
    certification: text("certification", { mode: "json" }),
    checkSchedule: text("check_schedule").notNull(),
    checkPercentage: real("check_percentage").notNull(),
    nextCheckAt: integer("next_check_at").notNull(),
    pruneSchedule: text("prune_schedule").notNull(),
    nextPruneAt: integer("next_prune_at").notNull(),
    repositoryStatus: text("repository_status").notNull(),
});

// Strategy Table
export const strategy = sqliteTable("strategy_table", {
    id: integer("strategy_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    hostname: text("hostname").notNull(),
    dataSource: text("data_source").notNull(),
    dataSourceSize: integer("data_source_size").notNull(), // 0 for unavailable
    strategyType: text("strategy_type").notNull(),
});

// Backup Target Table (Links strategy to Repository)
export const backupTarget = sqliteTable("backup_target_table", {
    id: integer("backup_target_id").primaryKey({ autoIncrement: true }),
    backupStrategyId: integer("backup_strategy_id").references(() => strategy.id, { onDelete: 'cascade' }).notNull(),
    repositoryId: integer("repository_id").references(() => repository.id, { onDelete: 'cascade' }).notNull(),
    retentionPolicy: text("retention_policy", { mode: "json"}).notNull(),
    schedulePolicy: text("schedule_policy").notNull(),
    nextBackupAt: integer("next_backup_at").notNull(),
    index: integer("index").notNull(),
}, (table) => [
    index("target_strategy_id_idx").on(table.backupStrategyId),
    index("target_repository_id_idx").on(table.repositoryId),
]);

// Snapshots Metadata Table
export const snapshotsMetadata = sqliteTable("snapshots_metadata_table", {
    id: integer("snapshot_db_id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").references(() => repository.id, { onDelete: 'cascade' }).notNull(),
    path: text("path").notNull(),
    snapshotId: text("snapshot_id").notNull().unique(), // The ID from the backup engine
    hostname: text("hostname"),
    username: text("username"),
    uid: integer("uid"),
    gid: integer("gid"),
    excludes: text("excludes", { mode: "json" }),
    tags: text("tags", { mode: "json" }),
    programVersion: text("program_version"),
    time: integer("time").notNull(),
    snapshotStatus: text("snapshotStatus", { enum: ['success', 'partial'] }).notNull(),
    snapshotSummary: text("snapshotSummary", { mode: "json" }).notNull(),
    size: integer("size").notNull(),
}, (table) => [
    uniqueIndex("snapshots_metadata_snapshot_id_unique").on(table.repositoryId, table.snapshotId),
]);

// Restore File Table
export const restores = sqliteTable("restores_table", {
    id: integer("restores_id").primaryKey({ autoIncrement: true }),
    snapshotsMetadataId: integer("snapshot_metadata_id").references(() => snapshotsMetadata.id, { onDelete: 'cascade' }).notNull(),
    // file meta data
    files: text("files", { mode: 'json'}).notNull(),
    // result meta data
    serverPath: text("server_path"),
    resultName: text("result_name"),
    resultType: text("result_type"), // file extension
    resultSize: integer("result_size"),
    // timestamp
    createdAt: integer("createdAt").notNull(),
    finishedAt: integer("finishedAt"),
}, (table) => [
    index("restores_snapshots_metadata_id_idx").on(table.snapshotsMetadataId),
])

// Execution Table
export const execution = sqliteTable("execution_table", {
    id: integer("execution_id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull(),
    logFile: text("log_file"),
    errorFile: text("error_file"),
    commandType: text("command_type").notNull(),
    fullCommand: text("full_command"),
    exitCode: integer("exit_code"),
    scheduledAt: integer("scheduled_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    executeStatus: text("execute_status", { enum: ["success", "fail", "running", "pending", "cancel", "kill"] }).notNull(),
    repositoryId: integer("repository_id").references(() => repository.id, { onDelete: 'cascade' }), // repo check, prune
    backupTargetId: integer("backup_target_id").references(() => backupTarget.id, { onDelete: 'cascade' }), // backup, copyTo
    snapshotsMetadataId: integer("snapshots_metadata_id").references(() => snapshotsMetadata.id, { onDelete: 'cascade' }), // backup
    restoresId: integer("restores_id").references(() => restores.id, { onDelete: 'cascade' }), // restore
}, (table) => [
    index("executions_repository_id_idx").on(table.restoresId),
    index("executions_backup_target_id_idx").on(table.backupTargetId),
    index("executions_snapshots_metadata_id_idx").on(table.snapshotsMetadataId),
    index("executions_restores_id_idx").on(table.restoresId),
])

// System Settings Table
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
    snapshot: one(snapshotsMetadata, {
        fields: [execution.snapshotsMetadataId],
        references: [snapshotsMetadata.id],
    }),
    // Link to Restores
    restore: one(restores, {
        fields: [execution.restoresId],
        references: [restores.id],
    }),
    // Link to Repository directly
    repository: one(repository, {
        fields: [execution.repositoryId],
        references: [repository.id],
    }),
}));
// repository => multiple execution
export const repositoryRelations = relations(repository, ({ many }) => ({
    executions: many(execution),
}))
// restore => multiple execution
export const restoresRelations = relations(restores, ({ one, many }) => ({
    executions: many(execution),
    // Link to Snapshots metadata
    snapshot: one(snapshotsMetadata, {
        fields: [restores.snapshotsMetadataId],
        references: [snapshotsMetadata.id],
    })
}))
// snapshots metadata => multiple restores
export const snapshotsMetadataRelations = relations(snapshotsMetadata, ({ one, many }) => ({
    restores: many(restores),
    repository: one(repository, {
        fields: [snapshotsMetadata.repositoryId],
        references: [repository.id],
    })
}))