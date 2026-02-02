import { IconDatabase, IconCloudUpload } from '@tabler/icons-react';
import {type InsertBackupPolicySchema, type InsertBackupTargetSchema, type StrategyType} from '@backstream/shared'
import React from "react";
import LocalBackupSubForm from "./components/LocalBackupSubForm.tsx";

import type {UseFormReturnType} from "@mantine/form";
import Strategy321SubForm from "./components/Strategy321SubForm.tsx";

interface StrategyMeta {
    label: string,
    description: string,
    icon: React.ForwardRefExoticComponent<any>,
    component: React.FC<{ form: UseFormReturnType<InsertBackupPolicySchema>}> | null,
    initSubForm: InsertBackupTargetSchema[]
}

export const STRATEGY_MAP: Record<StrategyType, StrategyMeta> = {
    STRATEGY_321: {
        label: '3-2-1 Strategy',
        description: 'local + cloud redundancy.',
        icon: IconCloudUpload,
        component: Strategy321SubForm,
        initSubForm: [
            {
                repositoryId: 0,
                retentionPolicy: {
                    type: "count",
                    windowType: "last",
                    countValue: "100"
                },
                schedulePolicy: "* * * * * *",
                index: 1
            },
            {
                repositoryId: 0,
                retentionPolicy: {
                    type: "count",
                    windowType: "last",
                    countValue: "100"
                },
                schedulePolicy: "* * * * * *",
                index: 2
            }
        ]
    },
    LOCAL_BACKUP: {
        label: 'Local Backup',
        description: 'versioned backup to local disk',
        icon: IconDatabase,
        component: LocalBackupSubForm,
        initSubForm: [{
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
}