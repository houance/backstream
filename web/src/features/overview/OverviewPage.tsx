import React from 'react';
import { Grid, Container, Stack } from '@mantine/core';
import {BackupStrategyCard} from "./components/BackupStrategyCard.tsx";
import {StatsCardGroup} from "./components/StatsCardGroup.tsx";
import {RecentActivityCard} from "./components/RecentActivityCard.tsx";

const OverviewPage: React.FC = () => {
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
                                <BackupStrategyCard strategy={{
                                    name: 'Music Collection',
                                    strategyType: '3-2-1',
                                    dataSource: '/music',
                                    targets: [
                                        {
                                            repositoryName: 'local',
                                            targetType: 'local',
                                            usage: 500,
                                            capacity: 1000,
                                            repositoryId: 1,
                                            lastBackupTimestamp: 1769573950000
                                        },
                                        {
                                            repositoryName: 's3',
                                            targetType: 'backblaze b2',
                                            usage: 91,
                                            capacity: 100,
                                            repositoryId: 2,
                                            lastBackupTimestamp: 1769573950000
                                        }
                                    ]
                                }}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ sm: 4 }}>
                                <BackupStrategyCard strategy={{
                                    name: 'Image Collection',
                                    strategyType: '3-2-1',
                                    dataSource: '/image',
                                    targets: [
                                        {
                                            repositoryName: 'local',
                                            targetType: 'local',
                                            usage: 500,
                                            capacity: 1000,
                                            repositoryId: 1,
                                            lastBackupTimestamp: 1769573950000
                                        },
                                        {
                                            repositoryName: 's3',
                                            targetType: 'backblaze b2',
                                            usage: 20,
                                            capacity: 100,
                                            repositoryId: 2,
                                            lastBackupTimestamp: 1769573950000
                                        }
                                    ]
                                }}
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
