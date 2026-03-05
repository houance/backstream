import { IconDatabase, IconCloudUpload } from '@tabler/icons-react';
import {
    type InsertBackupPolicySchema,
    type InsertBackupTargetSchema,
    type StrategyType,
    type UpdateRepositorySchema
} from '@backstream/shared'
import React from "react";
import MultiVersionBackupForm from "./components/MultiVersionBackupForm.tsx";

import type {UseFormReturnType} from "@mantine/form";
import Strategy321Form from "./components/Strategy321Form.tsx";

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
    MULTI_VERSION_BACKUP: {
        label: 'Multi Version Backup',
        description: 'Historical snapshots for reliable data restoration',
        icon: IconDatabase,
        component: MultiVersionBackupForm,
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
        description: 'Three copies, two media, one offsite',
        icon: IconCloudUpload,
        component: Strategy321Form,
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