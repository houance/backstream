import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// 1. Repository Table
export const repositories = sqliteTable("repository_table", {
    id: integer("repository_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    providerType: text("provider_type", {enum: ["local", "backblaze b2", "aliyun oss"]}).notNull(), // local, alibaba oss, etc.
    lastBackupAt: integer("last_backup_at", { mode: "timestamp" }),
    size: integer("size").default(0),
    configData: text("config_data"), // Store as JSON string
});

// 2. Data Source Table
export const dataSources = sqliteTable("data_source_table", {
    id: integer("data_source_id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    path: text("path").notNull(),
});

// 3. Backup Target Table (Links Data Source to Repository)
export const backupTargets = sqliteTable("backup_target_table", {
    id: integer("backup_target_id").primaryKey({ autoIncrement: true }),
    dataSourceId: integer("data_source_id").references(() => dataSources.id),
    repositoryId: integer("repository_id").references(() => repositories.id),
    retentionPolicy: text("retention_policy", { mode: "json"}),
    lastRunAt: integer("last_run_at", { mode: "timestamp" }),
    backupStatus: text("backup_status"),
    useCopy: integer("use_copy", { mode: "boolean" }).default(false),
});

// 4. Snapshots Metadata Table
export const snapshotsMetadata = sqliteTable("snapshots_metadata_table", {
    id: integer("snapshot_db_id").primaryKey({ autoIncrement: true }),
    snapshotId: text("snapshot_id").notNull(), // The ID from the backup engine
    hostname: text("hostname"),
    username: text("username"),
    backupStart: integer("backup_start", { mode: "timestamp" }),
    backupEnd: integer("backup_end", { mode: "timestamp" }),
    totalBytes: integer("total_bytes"),
    fileCount: integer("file_count"),
    dirCount: integer("dir_count"),
});

// For selecting (reading)
export type Repository = typeof repositories.$inferSelect;
export type DataSource = typeof dataSources.$inferSelect;
export type BackupTarget = typeof backupTargets.$inferSelect;
export type SnapshotMetadata = typeof snapshotsMetadata.$inferSelect;

// For inserting (creating) - These allow 'id' to be optional/omitted
export type NewRepository = typeof repositories.$inferInsert;
export type NewDataSource = typeof dataSources.$inferInsert;
export type NewBackupTarget = typeof backupTargets.$inferInsert;
export type NewSnapshotMetadata = typeof snapshotsMetadata.$inferInsert;