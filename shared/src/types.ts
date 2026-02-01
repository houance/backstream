import { z } from "zod";
import { createInsertSchema } from 'drizzle-zod';
import { repository } from './schema';

export const RepoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;

export type RepoType = typeof RepoType[keyof typeof RepoType];

// Define the specific provider schemas
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

// The main schema
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
});
// Insert Repository
export type InsertRepositorySchema = z.infer<typeof insertRepositorySchema>
// query or update repository
export const updateRepositorySchema = z.object({
    ...insertRepositorySchema.shape,
    id: z.number().positive()
})
export type UpdateRepositorySchema = z.infer<typeof updateRepositorySchema>
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

export const systemSettings = z.object({
    ioPriority: z.enum(['low', 'normal']),
    minDiskSpaceGB: z.number().min(1, 'Minimum 1GB required').max(500),
    notificationEmail: z.email('Invalid email format').or(z.literal('')),
    alertOnFailureOnly: z.boolean(),
    logRetentionDays: z.number().min(1, 'Keep at least 1 day').max(365, 'Max 1 year'),
});

export type SystemSettings = z.infer<typeof systemSettings>;
