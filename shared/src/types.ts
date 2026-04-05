import { z } from "zod";
import {createInsertSchema, createUpdateSchema} from 'drizzle-zod';
import {
    backupTarget,
    execution,
    jobSchedules,
    repository,
    restores,
    setting,
    snapshotsMetadata,
    strategy
} from './schema';


// cron format: sec min hour day month day-of-week
const cronSecondRegex = /^(?:[0-9*,\/\-]+ ){5}[0-9*,\/\-]+$/;
export const repoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;
export type RepoType = typeof repoType[keyof typeof repoType];
export const scheduleStatus = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    ERROR: "ERROR",
} as const;
export type ScheduleStatus = typeof scheduleStatus[keyof typeof scheduleStatus];
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
    repositoryType: z.enum(Object.values(repoType)),
    certification: certificateSchema,
    linkStatus: z.enum(['UP', 'DOWN']).default('DOWN'),
    healthStatus: z.enum(['HEALTH', 'CORRUPT', 'INITIALIZING', 'INITIALIZE_FAIL']).default('INITIALIZING'),
    adminStatus: z.enum(['ACTIVE', 'PAUSED']).default('ACTIVE')
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
// strategy type
export const StrategyType = {
    STRATEGY_321: "STRATEGY_321",
    MULTI_VERSION_BACKUP: "MULTI_VERSION_BACKUP",
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
    repositoryId: z.coerce.number().min(1, "Please select a value"),
    retentionPolicy: retentionPolicy,
    index: z.number().positive().min(1),
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
// snapshot file type
export const SnapshotFileType = {
    FILE: 'file',
    DIR: 'dir',
    SYMLINK: 'symlink',
    DEV: 'dev',
    CHARDEV: 'chardev',
    FIFO: 'fifo',
    SOCKET: 'socket',
}
export type SnapshotFileType = typeof SnapshotFileType[keyof typeof SnapshotFileType];
export const snapshotFile = z.object({
    snapshotId: z.string(),
    repoId: z.number().positive(),
    name: z.string(),
    type: z.enum(Object.values(SnapshotFileType)),
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
export const onGoingProcess = z.object({
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
    repoName: z.string(),
    commandType: z.string(),
})
export type OnGoingProcess = z.infer<typeof onGoingProcess>;
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
export const execStatus = {
    SUCCESS: "success",
    FAIL: "fail",
    REJECT: "reject",
    RUNNING: "running",
    PENDING: "pending",
    CANCEL: "cancel",
    KILL: "kill",
} as const;
// This extracts "success" | "fail" | "running" | etc.
export type ExecutionStatus = typeof execStatus[keyof typeof execStatus];
export const insertExecutionSchema = createInsertSchema(execution, {
    commandType: z.enum(Object.values(commandType)),
    executeStatus: z.enum(Object.values(execStatus)),
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
// restore job key
export const restoreJobKey = z.object({
    executionId: z.number().positive().optional(),
    snapshotId: z.string(),
    path: z.string(),
    repoId: z.number().positive(),
})
export type RestoreJobKey = z.infer<typeof restoreJobKey>;
// post to get same drive repo
export const sameDriveRepoRequest = z.object({
    dataSource: z.string(),
    repoIds: z.array(z.number().positive()),
})
export type SameDriveRepoRequest = z.infer<typeof sameDriveRepoRequest>;
// general filter
export const filterQuery = z.object({
    page: z.number().int().min(0).default(1),
    pageSize: z.number().int().min(10).max(30).default(15),
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
})
export type FilterQuery = z.infer<typeof filterQuery>;
// fail history
export const failHistory = z.object({
    executionId: z.number().nonnegative(),
    uuid: z.string(),
    scheduledAt: z.number().min(0),
    startAt: z.number().min(0).optional(),
    finishedAt: z.number().min(0).optional(),
    commandType: z.string(),
    failReason: z.string(),
    fullCommand: z.string(),
})
export type FailHistory = z.infer<typeof failHistory>;
// restores schema
export const insertRestoreSchema = createInsertSchema(restores, {
    files: z.array(z.object({
        path: z.string(),
        name: z.string(),
        type: z.enum(Object.values(SnapshotFileType))
    }))
}).omit({ id: true })
export type InsertRestoreSchema = z.infer<typeof insertRestoreSchema>;
export const updateRestoreSchema = insertRestoreSchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateRestoreSchema = z.infer<typeof updateRestoreSchema>;
export const restoreDataSchema = updateRestoreSchema.safeExtend({
    executions: updateExecutionSchema.array()
})
export type RestoreDataSchema = z.infer<typeof restoreDataSchema>;
// job schedules schema
const baseInsertJobScheduleSchema = createInsertSchema(jobSchedules, {
    cron: z.string()
        .min(1, "Cron expression is required")
        .regex(cronSecondRegex, 'Invalid cron format (requires 6 fields: s m h D M d)')
        .or(z.literal("manual")),
    jobStatus: z.enum(Object.values(scheduleStatus)),
});
export const insertRepoScheduleSchema = baseInsertJobScheduleSchema.safeExtend({
    category: z.literal('repository'),
    type: z.enum(['check', 'prune', 'stat', 'snapshots', 'heartbeat']),
    repositoryId: z.number().positive(),
    extraConfig: z.object({
        checkPercentage: z.number()
            .min(0, "number between 0 ~ 1")
            .max(1, "number between 0 ~ 1"),
    }).nullish(),
})
export type InsertRepoScheduleSchema = z.infer<typeof insertRepoScheduleSchema>;
export const updateRepoScheduleSchema = insertRepoScheduleSchema.safeExtend({
    id: z.number().positive(),
});
export type UpdateRepoScheduleSchema = z.infer<typeof updateRepoScheduleSchema>;
export const insertTargetScheduleSchema = baseInsertJobScheduleSchema.safeExtend({
    category: z.literal('target'),
    type: z.enum(['backup', 'copy']),
    repositoryId: z.number().positive(),
    backupStrategyId: z.number().positive(),
    backupTargetId: z.number().positive(),
    extraConfig: z.object({
        srcRepoId: z.number().positive(), // for copy job to look up source repository
    }).nullish(),
})
export type InsertTargetScheduleSchema = z.infer<typeof insertTargetScheduleSchema>;
export const updateTargetScheduleSchema = insertTargetScheduleSchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateTargetScheduleSchema = z.infer<typeof updateTargetScheduleSchema>;
export const insertStrategyScheduleSchema = baseInsertJobScheduleSchema.safeExtend({
    category: z.literal('strategy'),
    type: z.literal('datasize'),
    backupStrategyId: z.number().positive(),
})
export type InsertStrategyScheduleSchema = z.infer<typeof insertStrategyScheduleSchema>;
export const updateStrategyScheduleSchema = insertStrategyScheduleSchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateStrategyScheduleSchema = z.infer<typeof updateStrategyScheduleSchema>;
export const insertSystemScheduleSchema = baseInsertJobScheduleSchema.safeExtend({
    category: z.literal('system'),
    type: z.literal('clean')
})
export type InsertSystemScheduleSchema = z.infer<typeof insertSystemScheduleSchema>;
export const updateSystemScheduleSchema = insertSystemScheduleSchema.safeExtend({
    id: z.number().positive(),
})
export type UpdateSystemScheduleSchema = z.infer<typeof updateSystemScheduleSchema>;
export const insertJobScheduleSchema = z.discriminatedUnion('category', [
    insertRepoScheduleSchema,
    insertTargetScheduleSchema,
    insertStrategyScheduleSchema,
    insertSystemScheduleSchema
]);
export type InsertJobScheduleSchema = z.infer<typeof insertJobScheduleSchema>;
export const updateJobScheduleSchema = z.discriminatedUnion('category', [
    updateRepoScheduleSchema,
    updateTargetScheduleSchema,
    updateStrategyScheduleSchema,
    updateSystemScheduleSchema
]);
export type UpdateJobScheduleSchema = z.infer<typeof updateJobScheduleSchema>;