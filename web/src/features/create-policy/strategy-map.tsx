import { IconDatabase, IconCloudUpload } from '@tabler/icons-react';
import {
    type InsertBackupPolicySchema,
    type InsertBackupTargetSchema,
    type StrategyType,
    type UpdateRepositorySchema
} from '@backstream/shared'
import React from "react";
import LocalBackupSubForm from "./components/LocalBackupSubForm.tsx";

import type {UseFormReturnType} from "@mantine/form";
import Strategy321SubForm from "./components/Strategy321SubForm.tsx";

interface StrategyMeta {
    label: string,
    description: string,
    icon: React.ForwardRefExoticComponent<any>,
    component: React.FC<{
        form: UseFormReturnType<InsertBackupPolicySchema>,
        repoList: UpdateRepositorySchema[]
    }>,
    initSubForm: InsertBackupTargetSchema[]
}

export const STRATEGY_MAP: Record<StrategyType, StrategyMeta> = {

    LOCAL_BACKUP: {
        label: 'Local Backup',
        description: 'versioned backup to local disk',
        icon: IconDatabase,
        component: LocalBackupSubForm,
        initSubForm: [{
            backupStrategyId: 0,
            repositoryId: 0,
            retentionPolicy: {
                type: "count",
                windowType: "last",
                countValue: ""
            },
            schedulePolicy: "* * * * * *",
            index: 1,
            nextBackupAt: 0
        }]
    },
    STRATEGY_321: {
        label: '3-2-1 Strategy',
        description: 'local + cloud redundancy.',
        icon: IconCloudUpload,
        component: Strategy321SubForm,
        initSubForm: [
            {
                backupStrategyId: 0,
                repositoryId: 0,
                retentionPolicy: {
                    type: "count",
                    windowType: "last",
                    countValue: ""
                },
                schedulePolicy: "* * * * * *",
                index: 1,
                nextBackupAt: 0
            },
            {
                backupStrategyId: 0,
                repositoryId: 0,
                retentionPolicy: {
                    type: "count",
                    windowType: "last",
                    countValue: ""
                },
                schedulePolicy: "* * * * * *",
                index: 2,
                nextBackupAt: 0
            }
        ]
    }
}