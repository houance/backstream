import {
    insertBackupStrategySchema, insertBackupTargetSchema, insertRepoScheduleSchema,
    insertRepositorySchema, insertTargetScheduleSchema, InsertTargetScheduleSchema, repoType,
    scheduleStatus,
    StrategyType, updateBackupStrategySchema, updateBackupTargetSchema, updateRepositorySchema
} from "./types";
import {z} from "zod";

// storage create schema
export const storageCreateSchema = z.object({
    meta: insertRepositorySchema,
    checkSchedule: insertRepoScheduleSchema.safeExtend({
        extraConfig: z.object({
            checkPercentage: z.number()
                .min(0, "number between 0 ~ 1")
                .max(1, "number between 0 ~ 1"),
        })
    }).omit({ repositoryId: true }),
    pruneSchedule: insertRepoScheduleSchema.omit({ repositoryId: true }),
    mode: z.enum(['create', 'connect']),
    fromRepoId: z.coerce.number().min(1).optional()
})
export type StorageCreateSchema = z.infer<typeof storageCreateSchema>;
// empty schema for react
export const EMPTY_STORAGE_CREATE_SCHEMA: StorageCreateSchema = {
    meta: {
        name: "",
        path: "",
        password: "",
        repositoryType: repoType.LOCAL,
        certification: {},
        linkStatus: "DOWN",
        healthStatus: "INITIALIZING",
        adminStatus: "ACTIVE"
    },
    checkSchedule: {
        type: "check",
        category: "repository",
        cron: "",
        jobStatus: "ACTIVE",
        extraConfig: {
            checkPercentage: 0
        }
    },
    pruneSchedule: {
        type: "prune",
        category: "repository",
        cron: "",
        jobStatus: "ACTIVE"
    },
    mode: 'create',
    fromRepoId: 0
}
// policy create schema
export const insertBackupPolicySchema = z.object({
    strategy: insertBackupStrategySchema,
    targets: z.array(z.object({
        meta: insertBackupTargetSchema.omit({ backupStrategyId: true }),
        schedule: insertTargetScheduleSchema.omit({ backupStrategyId: true, backupTargetId: true }),
    }))
})
export type InsertBackupPolicySchema = z.infer<typeof insertBackupPolicySchema>;
// empty schema for react
export const EMPTY_POLICY_CREATE_SCHEMA: InsertBackupPolicySchema = {
    strategy: {
        name: "",
        hostname: "",
        dataSource: "",
        dataSourceSize: 0,
        strategyType: StrategyType.MULTI_VERSION_BACKUP,
    },
    targets: [{
        meta: {
            repositoryId: 0,
            retentionPolicy: {
                type: "count",
                windowType: 'last',
                countValue: '1'
            },
            index: 1
        },
        schedule: {
            type: "backup",
            category: "target",
            repositoryId: 0,
            cron: "",
            jobStatus: "ACTIVE"
        }
    }]
}
// policy update schema
export const updateBackupPolicySchema = z.object({
    strategy: updateBackupStrategySchema,
    targets: z.array(updateBackupTargetSchema.safeExtend({
        repository: updateRepositorySchema,
        lastBackupAt: z.number().min(0).nullable()
    }))
})
export type UpdateBackupPolicySchema = z.infer<typeof updateBackupPolicySchema>;