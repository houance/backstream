import React from 'react';
import { Grid, Container, Stack } from '@mantine/core';
import {BackupStrategyCard} from "./components/BackupStrategyCard.tsx";
import {StatsCardGroup} from "./components/StatsCardGroup.tsx";
import {RecentActivityCard} from "./components/RecentActivityCard.tsx";
import type { UpdateBackupPolicySchema } from '@backstream/shared';

const OverviewPage: React.FC = () => {
    const policy: UpdateBackupPolicySchema[] = [
        {
        strategy: {
            name: 'Music Collection',
            strategyType: 'STRATEGY_321',
            dataSource: '/music',
            hostname: '',
            dataSourceSize: 0,
            id: 0
        },
        targets: [
            {
                repository: {
                    path: '',
                    name: 'local',
                    password: '',
                    repositoryType: 'LOCAL',
                    usage: 500,
                    capacity: 1000,
                    repositoryStatus: 'Active',
                    id: 0
                },
                repositoryId: 1,
                lastBackupTimestamp: 1769573950000,
                retentionPolicy: {
                    type: 'duration'
                },
                schedulePolicy: '',
                index: 0,
                id: 0
            },
            {
                repository: {
                    name: 'b2',
                    path: '',
                    password: '',
                    repositoryType: 'BACKBLAZE_B2',
                    usage: 91,
                    capacity: 100,
                    repositoryStatus: 'Active',
                    id: 0
                },
                repositoryId: 2,
                lastBackupTimestamp: 1769573950000,
                retentionPolicy: {
                    type: 'duration'
                },
                schedulePolicy: '',
                index: 0,
                id: 0
            }
        ]},
        {
            strategy: {
                name: 'Image Collection',
                strategyType: 'STRATEGY_321',
                dataSource: '/image',
                hostname: '',
                dataSourceSize: 0,
                id: 0
            },
            targets: [
                {
                    repository: {
                        path: '',
                        name: 'local',
                        password: '',
                        repositoryType: 'LOCAL',
                        usage: 500,
                        capacity: 1000,
                        repositoryStatus: 'Active',
                        id: 0
                    },
                    repositoryId: 1,
                    lastBackupTimestamp: 1769573950000,
                    retentionPolicy: {
                        type: 'duration'
                    },
                    schedulePolicy: '',
                    index: 0,
                    id: 0
                },
                {
                    repository: {
                        name: 's3',
                        path: '',
                        password: '',
                        repositoryType: 'AWS_S3',
                        usage: 50,
                        capacity: 100,
                        repositoryStatus: 'Active',
                        id: 0
                    },
                    repositoryId: 2,
                    lastBackupTimestamp: 1769573950000,
                    retentionPolicy: {
                        type: 'duration'
                    },
                    schedulePolicy: '',
                    index: 0,
                    id: 0
                }
            ]}
    ]


    return (
        <Container fluid p={0}>
            <Stack gap="xl">
                {/* 三个卡片, 所有备份策略的 overview */}
                <StatsCardGroup activeCount={1} totalSize={100} complianceRate={1} />

                {/* by strategy 展示汇总信息 */}
                <Grid gutter="xl">
                    {/* backup policy status */}
                    <Grid.Col span={{ md: 8 }}>
                        <Grid gutter="md">
                            <Grid.Col span={{ sm: 4 }}>
                                <BackupStrategyCard policy={policy[0]}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ sm: 4 }}>
                                <BackupStrategyCard policy={policy[1]}
                                />
                            </Grid.Col>
                        </Grid>
                    </Grid.Col>

                    {/* 3. recent activity */}
                    <Grid.Col span={{ md: 4 }}>
                        <RecentActivityCard activitiesList={[
                            {
                                id: 1,
                                title: "Backup Up",
                                description: 'DB Backup Up',
                                completeAt: 1769573950000,
                                level: 'INFO'
                            }
                        ]}/>
                    </Grid.Col>
                </Grid>
            </Stack>
        </Container>
    );
};

export default OverviewPage;
