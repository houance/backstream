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

// Define the inner certification schemas
const sftpSchema = z.object({
    SSH_AUTH_SOCK: z.string().optional()
})

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
export const repositorySchema = createInsertSchema(repository, {
    name: z.string().min(2, 'Name is too short'),
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
}).superRefine((data, ctx) => {
    // Cross-field validation: If Type is S3, validate the S3 object strictly
    if (data.repositoryType === 'S3' || data.repositoryType === 'AWS_S3') {
        const result = s3Schema.safeParse(data.certification.s3);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                ctx.addIssue({ ...issue, path: ['certification', 's3', ...issue.path] });
            });
        }
    } else if (data.repositoryType === 'BACKBLAZE_B2') {
        const result = b2Schema.safeParse(data.certification.b2);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                ctx.addIssue({ ...issue, path: ['certification', 'b2', ...issue.path] });
            });
        }
    } else if (data.repositoryType === 'ALIYUN_OSS') {
        const result = ossSchema.safeParse(data.certification.oss);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                ctx.addIssue({ ...issue, path: ['certification', 'aliyun oss', ...issue.path] });
            });
        }
    } else if (data.repositoryType === 'SFTP') {
        const result = sftpSchema.safeParse(data.certification.sftp);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                ctx.addIssue({ ...issue, path: ['certification', 'sftp', ...issue.path] });
            });
        }
    }
});
// Query and Update Repository
export type RepositorySchema = z.infer<typeof repositorySchema>
// Insert Repository
export const insertOrUpdateRepository = repositorySchema.safeExtend({ id: z.number().optional()})
export type InsertOrUpdateRepository = z.infer<typeof insertOrUpdateRepository>