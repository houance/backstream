import { z } from "zod";
import {createInsertSchema, createUpdateSchema} from 'drizzle-zod';
import {backupTarget, execution, repository, setting, snapshotsMetadata, strategy} from './schema';


// cron format: sec min hour day month day-of-week
const cronSecondRegex = /^(?:[0-9*,\/\-]+ ){5}[0-9*,\/\-]+$/;
export const RepoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;
export type RepoType = typeof RepoType[keyof typeof RepoType];
// Define the specific restic provider schemas
const sftpSchema = z.object({SSH_AUTH_SOCK: z.string().optional()})
const s3Schema = z.object({
    AWS_ACCESS_KEY_ID: z.string().min(1, 'Access Key is required'),
    AWS_SECRET_ACCESS_KEY: z.string().min(1, 'Secret Key is required'),
    AWS_DEFAULT_REGION: z.string().optional(),
    AWS_ENDPOINT: z.string().optional(),
    AWS_PROFILE: z.string().optional(),
});
const b2Schema = z.object({
    B2_ACCOUNT_ID: z.string().min(1, 'Account ID is required'),
    B2_ACCOUNT_KEY: z.string().min(1, 'Account Key is required'),
});
const ossSchema = z.object({
    OSS_ACCESS_KEY_ID: z.string().min(1, 'Access Key is required'),
    OSS_SECRET_ACCESS_KEY: z.string().min(1, 'SecretKey is required'),
    OSS_ENDPOINT: z.string().optional(),
})
export const certificateSchema = z.object({
    s3: s3Schema.partial().optional(), // Fields are partial so they can be empty when hidden
    b2: b2Schema.partial().optional(),
    oss: ossSchema.partial().optional(),
    sftp: sftpSchema.partial().optional(),
}).nullable()
export type CertificateSchema = z.infer<typeof certificateSchema>;
// The restic repository main schema
export const insertRepositorySchema = createInsertSchema(repository, {
    name: z.string().min(1, 'Name is required'),
    path: z.string().min(1, 'Path is required'),
    password: z.string().min(4, 'Password must be at least 4 characters'),
    repositoryType: z.enum(Object.values(RepoType)),
    repositoryStatus: z.enum(['Active', 'Disconnected', 'Corrupt']),
    certification: certificateSchema,
    checkSchedule: z.string()
        .min(1, "Check Schedule is required")
        .regex(cronSecondRegex, 'Invalid cron format (requires 6 fields: s m h D M d)')
        .or(z.literal("manual")),
    checkPercentage: z.number()
        .min(0, "number between 0 ~ 1")
        .max(1, "number between 0 ~ 1"),
    nextCheckAt: z.number().default(0),
    pruneSchedule: z.string()
        .min(1, "Check Schedule is required")
        .regex(cronSecondRegex, 'Invalid cron format (requires 6 fields: s m h D M d)')
        .or(z.literal("manual")),
    nextPruneAt: z.number().default(0),
}).omit({ id: true });
// Insert Repository
export type InsertRepositorySchema = z.infer<typeof insertRepositorySchema>
// query or update repository
export const updateRepositorySchema = insertRepositorySchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateRepositorySchema = z.infer<typeof updateRepositorySchema>
// system settings schema, only update schema since it always have only on record in db
export const updateSettingSchema = createUpdateSchema(setting, {
    ioPriority: z.enum(['low', 'normal']),
    minDiskSpaceGB: z.number().min(1, 'Minimum 1GB required').max(500),
    email: z.email('Invalid email format').or(z.literal('')),
    logRetentionDays: z.number().min(1, 'Keep at least 1 day').max(365, 'Max 1 year'),
}).safeExtend({ id: z.number() });
export type UpdateSystemSettingSchema = z.infer<typeof updateSettingSchema>;
// initial value for all field in repository schema
export const EMPTY_REPOSITORY_SCHEMA: InsertRepositorySchema = {
    name: '',
    path: '',
    password: '',
    repositoryType: RepoType.LOCAL,
    repositoryStatus: 'Disconnected',
    usage: 0,
    capacity: 1,
    certification: null,
    checkSchedule: "0 0 0 * * *",
    checkPercentage: 0.20,
    nextCheckAt: 1770967868630,
    pruneSchedule: "0 0 0 * * *",
    nextPruneAt: 1770967868630,
}
// strategy type
export const StrategyType = {
    STRATEGY_321: "STRATEGY_321",
    LOCAL_BACKUP: "LOCAL_BACKUP",
} as const;
export type StrategyType = typeof StrategyType[keyof typeof StrategyType];
// retention enum
export const RetentionType = {
    count: "count",
    duration: "duration",
    tag: "tag",
} as const;
export type RetentionType = typeof RetentionType[keyof typeof RetentionType];
export const WindowType = {
    last: "last",
    hourly: "hourly",
    daily: "daily",
    weekly: "weekly",
    monthly: "monthly",
    yearly: "yearly",
} as const;
export type WindowType = typeof WindowType[keyof typeof WindowType];
// retention policy
export const retentionPolicy = z.object({
    // 1. type: What kind of rule is this?
    type: z.enum(Object.values(RetentionType)),
    // 2. windowType: What time bucket does it apply to?
    windowType: z.enum(Object.values(WindowType)).optional(),
    // 3. Used for "count" types
    countValue: z.string()
        .regex(/^([0-9]+)$/, "Enter a number or 'unlimited'")
        .or(z.literal("unlimited"))
        .optional(),
    // 4. Used for "duration" types (keep-within)
    durationValue: z.string()
        .regex(/^(\d+y)?(\d+m)?(\d+d)?(\d+h)?$/, "Invalid duration (e.g. 2y5m)")
        .or(z.literal("unlimited"))
        .optional(),
    // 5. Used for "tag" types
    tagValue: z.array(z.string()).optional(),
})
export type RetentionPolicy = z.infer<typeof retentionPolicy>
// backup target schema
export const insertBackupTargetSchema = createInsertSchema(backupTarget, {
    backupStrategyId: z.any().transform(() => 0),
    retentionPolicy: retentionPolicy,
    schedulePolicy: z.string()
        .min(1, 'Schedule Policy is required')
        .regex(cronSecondRegex, 'Invalid cron format (requires 6 fields: s m h D M d)'),
    index: z.number().positive(),
    repositoryId: z.coerce.number().min(1, "Please select a value"),
    nextBackupAt: z.number().default(0),
}).omit({ id: true });
export type InsertBackupTargetSchema = z.infer<typeof insertBackupTargetSchema>;
export const updateBackupTargetSchema = insertBackupTargetSchema.safeExtend({
    id: z.number().positive(),
    backupStrategyId: z.number().positive(),
});
export type UpdateBackupTargetSchema = z.infer<typeof updateBackupTargetSchema>;
// create backup strategy schema
export const insertBackupStrategySchema = createInsertSchema(strategy, {
    name: z.string().min(1, 'Name is required'),
    dataSource: z.string()
        .min(2, 'Data source is required')
        .regex(/^(\/[a-zA-Z0-9._-]+)+\/?$/, 'Must be a valid Linux absolute path'),
    strategyType: z.enum(Object.values(StrategyType)),
}).omit({ id: true });
export type InsertBackupStrategySchema = z.infer<typeof insertBackupStrategySchema>;
export const updateBackupStrategySchema = insertBackupStrategySchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateBackupStrategySchema = z.infer<typeof updateBackupStrategySchema>;
// create backup policy schema
export const insertBackupPolicySchema = z.object({
    strategy: insertBackupStrategySchema,
    targets: z.array(insertBackupTargetSchema)
})
export type InsertBackupPolicySchema = z.infer<typeof insertBackupPolicySchema>;
export const EMPTY_BACKUP_POLICY_SCHEMA: InsertBackupPolicySchema = {
    strategy: {
        name: "",
        hostname: "",
        dataSource: "",
        dataSourceSize: 0,
        strategyType: StrategyType.LOCAL_BACKUP
    },
    targets: [{
        backupStrategyId: 0,
        repositoryId: 0,
        retentionPolicy: {
            type: "count",
            windowType: "last",
            countValue: "100"
        },
        schedulePolicy: "* * * * * *",
        nextBackupAt: 1770967868630,
        index: 1
    }]
}
export const updateBackupPolicySchema = z.object({
    strategy: updateBackupStrategySchema,
    targets: z.array(updateBackupTargetSchema.safeExtend({
        repository: updateRepositorySchema,
        lastBackupAt: z.number().min(0).nullable()
    }))
})
export type UpdateBackupPolicySchema = z.infer<typeof updateBackupPolicySchema>;
export const snapshotFile = z.object({
    snapshotId: z.string(),
    name: z.string(),
    type: z.enum(['file', 'dir', 'symlink', 'dev', 'chardev', 'fifo', 'socket']),
    size: z.number().min(0),
    path: z.string(),
    mtime: z.coerce.date().transform((date) => date.getTime()),
})
export type SnapshotFile = z.infer<typeof snapshotFile>;
export const finishedSnapshotsMetaSchema = z.object({
    snapshotId: z.string(),
    status: z.enum(['success', 'partial']),
    createdAtTimestamp: z.number().min(0),
    size: z.number().min(0),
})
export type FinishedSnapshotsMetaSchema = z.infer<typeof finishedSnapshotsMetaSchema>;
export const onGoingSnapshotsMetaSchema = z.object({
    executionId: z.number().nonnegative(),
    uuid: z.string(),
    status: z.enum(['running', 'pending']),
    createdAtTimestamp: z.number().min(0),
    progress: z.object({
        percent: z.number(),
        bytesDone: z.number().optional(),
        totalBytes: z.number().optional(),
        logs: z.array(z.string()).optional(),
    }).optional(),
    totalSize: z.number().nonnegative().optional(),
})
export type OnGoingSnapshotsMetaSchema = z.infer<typeof onGoingSnapshotsMetaSchema>;
export const scheduledSnapshotsMetaSchema = z.object({
    uuid: z.string(),
    status: z.literal('scheduled'),
    createdAtTimestamp: z.number().min(0)
})
export type ScheduledSnapshotsMetaSchema = z.infer<typeof scheduledSnapshotsMetaSchema>;
// activity interface
export interface Activity {
    id: number;
    title: string;
    description: string;
    completeAt: number;
    level: "INFO" | "WARN" | "ALERT";
}
// execution
export const commandType = {
    backup: "backup",
    prune: "prune",
    check: "check",
    restore: "restore",
    copy: "copy",
} as const;
export type CommandType = typeof commandType[keyof typeof commandType];
export const insertExecutionSchema = createInsertSchema(execution, {
    commandType: z.enum(Object.values(commandType)),
}).omit({ id: true })
export type InsertExecutionSchema = z.infer<typeof insertExecutionSchema>;
export const updateExecutionSchema = insertExecutionSchema.safeExtend({ id: z.number().positive() })
export type UpdateExecutionSchema = z.infer<typeof updateExecutionSchema>;
// snapshots summary inherit from restic
export const snapshotSummarySchema = z.object({
    backupStart: z.coerce.date().transform((date) => date.getTime()),
    backupEnd: z.coerce.date().transform((date) => date.getTime()),
    filesNew: z.number().nonnegative(),
    filesChanged: z.number().nonnegative(),
    filesUnmodified: z.number().nonnegative(),
    dirsNew: z.number().nonnegative(),
    dirsChanged: z.number().nonnegative(),
    dirsUnmodified: z.number().nonnegative(),
    dataBlobs: z.number().nonnegative(),
    treeBlobs: z.number().nonnegative(),
    dataAdded: z.number().nonnegative(),
    dataAddedPacked: z.number().nonnegative(),
    totalFilesProcessed: z.number().nonnegative(),
    totalBytesProcessed: z.number().nonnegative(),
})
// snapshots meta data schema
export const insertSnapshotsMetadataSchema = createInsertSchema(snapshotsMetadata, {
    time: z.coerce.date().transform((date) => date.getTime()),
    uid: z.number().nonnegative().optional(),
    gid: z.number().nonnegative().optional(),
    excludes: z.array(z.string()).nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    snapshotSummary: snapshotSummarySchema,
}).omit({ id: true })
export type InsertSnapshotsMetadataSchema = z.infer<typeof insertSnapshotsMetadataSchema>;
export const updateSnapshotsMetadataSchema = insertSnapshotsMetadataSchema.safeExtend({id: z.number().positive() })
export type UpdateSnapshotsMetadataSchema = z.infer<typeof updateSnapshotsMetadataSchema>;