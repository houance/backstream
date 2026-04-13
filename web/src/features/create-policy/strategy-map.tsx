import { IconDatabase, IconCloudUpload, type Icon } from '@tabler/icons-react';
import {
    type InsertBackupPolicySchema,
    type StrategyType, type TargetCreateSchema,
    type UpdateRepositorySchema
} from '@backstream/shared'
import React from "react";
import MultiVersionBackupForm from "./components/MultiVersionBackupForm.tsx";

import type {UseFormReturnType} from "@mantine/form";
import Strategy321Form from "./components/Strategy321Form.tsx";

interface StrategyMeta {
    label: string,
    description: string,
    icon: Icon,
    component: React.FC<{
        form: UseFormReturnType<InsertBackupPolicySchema>,
        repoList: UpdateRepositorySchema[]
    }>,
    initSubForm: TargetCreateSchema[]
}

export const STRATEGY_MAP: Record<StrategyType, StrategyMeta> = {
    MULTI_VERSION_BACKUP: {
        label: 'Multi-Version Backup',
        description: 'Historical snapshots for reliable data restoration',
        icon: IconDatabase,
        component: MultiVersionBackupForm,
        initSubForm: [{
            meta: {
                repositoryId: 0,
                retentionPolicy: {
                    type: "count",
                    windowType: "last",
                    countValue: "1"
                },
                index: 1,
            },
            schedule: {
                type: 'backup',
                repositoryId: 0,
                category: 'target',
                cron: '* * * * * *',
                jobStatus: 'ACTIVE'
            }
        }]
    },
    STRATEGY_321: {
        label: '3-2-1 Strategy',
        description: 'Three copies, two media, one offsite',
        icon: IconCloudUpload,
        component: Strategy321Form,
        initSubForm: [
            {
                meta: {
                    repositoryId: 0,
                    retentionPolicy: {
                        type: "count",
                        windowType: "last",
                        countValue: "1"
                    },
                    index: 1,
                },
                schedule: {
                    type: 'backup',
                    repositoryId: 0,
                    category: 'target',
                    cron: '* * * * * *',
                    jobStatus: 'ACTIVE'
                }
            },
            {
                meta: {
                    repositoryId: 0,
                    retentionPolicy: {
                        type: "count",
                        windowType: "last",
                        countValue: "1"
                    },
                    index: 2,
                },
                schedule: {
                    type: 'backup',
                    repositoryId: 0,
                    category: 'target',
                    cron: '* * * * * *',
                    jobStatus: 'ACTIVE',
                }
            }
        ]
    }
}