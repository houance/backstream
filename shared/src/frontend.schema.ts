import {InsertBackupPolicySchema, InsertRepositorySchema, repoType, scheduleStatus, StrategyType} from "./types";

export const EMPTY_REPOSITORY_SCHEMA: InsertRepositorySchema = {
    name: '',
    path: '',
    password: '',
    repositoryType: repoType.LOCAL,
    certification: null,
    checkSchedule: "manual",
    checkPercentage: 0.20,
    pruneSchedule: "manual",
    linkStatus: 'DOWN',
    healthStatus: 'INITIALIZING',
    adminStatus: 'ACTIVE'
}

export const EMPTY_BACKUP_POLICY_SCHEMA: InsertBackupPolicySchema = {
    strategy: {
        name: "",
        hostname: "",
        dataSource: "/",
        dataSourceSize: 0,
        strategyType: StrategyType.MULTI_VERSION_BACKUP
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
        scheduleStatus: scheduleStatus.ACTIVE,
        index: 1
    }]
}