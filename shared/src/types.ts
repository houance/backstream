import { z } from "zod";
import {createInsertSchema, createUpdateSchema} from 'drizzle-zod';
import {backupTarget, repository, setting, strategy} from './schema';

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
// The restic repository main schema
export const insertRepositorySchema = createInsertSchema(repository, {
    name: z.string().min(1, 'Name is required'),
    path: z.string().min(1, 'Path is required'),
    repositoryType: z.enum(Object.values(RepoType)),
    repositoryStatus: z.enum(['Active', 'Disconnected']),
    certification: z.object({
        RESTIC_PASSWORD: z.string().min(4, 'Password must be at least 4 characters'),
        s3: s3Schema.partial().optional(), // Fields are partial so they can be empty when hidden
        b2: b2Schema.partial().optional(),
        oss: ossSchema.partial().optional(),
        sftp: sftpSchema.partial().optional(),
    }),
}).omit({ id: true });
// Insert Repository
export type InsertRepositorySchema = z.infer<typeof insertRepositorySchema>
// query or update repository
export const updateRepositorySchema = insertRepositorySchema.safeExtend({
    id: true
})
export type UpdateRepositorySchema = z.infer<typeof updateRepositorySchema>
// initial value for all field in repository schema
export const EMPTY_REPOSITORY_SCHEMA: InsertRepositorySchema = {
    name: '',
    path: '',
    repositoryType: "LOCAL",
    repositoryStatus: 'Disconnected',
    usage: 0,
    capacity: 1,
    certification: {
        RESTIC_PASSWORD: '',
        b2: {
            B2_ACCOUNT_ID: "",
            B2_ACCOUNT_KEY: ""
        },
        oss: {
            OSS_ACCESS_KEY_ID: "",
            OSS_SECRET_ACCESS_KEY: "",
            OSS_ENDPOINT: ""
        },
        sftp: {
            SSH_AUTH_SOCK: ""
        },
        s3: {
            AWS_ACCESS_KEY_ID: "",
            AWS_SECRET_ACCESS_KEY: "",
            AWS_DEFAULT_REGION: "",
            AWS_ENDPOINT: "",
            AWS_PROFILE: ""
        }
    }
}
// system settings schema, only update schema since it always have only on record in db
export const systemSettings = createUpdateSchema(setting, {
    ioPriority: z.enum(['low', 'normal']),
    minDiskSpaceGB: z.number().min(1, 'Minimum 1GB required').max(500),
    email: z.email('Invalid email format').or(z.literal('')),
    logRetentionDays: z.number().min(1, 'Keep at least 1 day').max(365, 'Max 1 year'),
});
export type SystemSettings = z.infer<typeof systemSettings>;
// strategy type
export const StrategyType = {
    STRATEGY_321: "STRATEGY_321",
    LOCAL_BACKUP: "LOCAL_BACKUP",
} as const;
export type StrategyType = typeof StrategyType[keyof typeof StrategyType];
// cron format: sec min hour day month day-of-week
const cronSecondRegex = /^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[1-2]?\d|3[01])\s+(\*|[1-9]|1[0-2])\s+(\*|[0-6])$/;
// backup target schema
export const insertBackupTargetSchema = createInsertSchema(backupTarget, {
    retentionPolicy: z.object({
        // 1. type: What kind of rule is this?
        type: z.enum(["count", "duration", "tag"]),
        // 2. windowType: What time bucket does it apply to?
        windowType: z.enum(["last", "hourly", "daily", "weekly", "monthly", "yearly"]),
        // 3. Used for "count" types
        countValue: z.string()
            .regex(/^(unlimited|[0-9]+)$/, "Enter a number or 'unlimited'")
            .optional(),
        // 4. Used for "duration" types (keep-within)
        durationValue: z.string()
            .regex(/^(\d+y)?(\d+m)?(\d+d)?(\d+h)?$/, "Invalid duration (e.g. 2y5m)")
            .or(z.literal("unlimited"))
            .optional(),
        // 5. Used for "tag" types
        tagValue: z.array(z.string()).optional(),
    }),
    schedulePolicy: z.string()
        .min(1, 'Schedule Policy is required')
        .regex(cronSecondRegex, 'Invalid cron format (requires 6 fields: s m h D M d)'),
    index: z.number().positive(),
}).omit({ id: true, backupStrategyId: true });
export type InsertBackupTargetSchema = z.infer<typeof insertBackupTargetSchema>;
export const updateBackupTargetSchema = insertBackupTargetSchema.safeExtend({ id: true });
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
export const updateBackupStrategySchema = insertBackupStrategySchema.safeExtend({ id: true });
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
        strategyType: "LOCAL_BACKUP"
    },
    targets: [{
        repositoryId: 0,
        retentionPolicy: {
            type: "count",
            windowType: "last",
            countValue: "100"
        },
        schedulePolicy: "* * * * * *",
        index: 1
    }]
}
