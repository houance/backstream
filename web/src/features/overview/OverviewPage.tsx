import React, {useState} from 'react';
import {Grid, Container, Stack, Center, Loader} from '@mantine/core';
import {BackupPolicyCard} from "./components/BackupPolicyCard.tsx";
import {StatsCardGroup} from "./components/StatsCardGroup.tsx";
import {RecentActivityCard} from "./components/RecentActivityCard.tsx";
import type { UpdateBackupPolicySchema } from '@backstream/shared';
import {PolicyDetailModal} from "../policy-detail/PolicyDetailModal.tsx";
import {useDisclosure} from "@mantine/hooks";
import {useQuery} from "@tanstack/react-query";
import {client} from "../../api";

const OverviewPage: React.FC = () => {
    const [opened, { open, close }] = useDisclosure(false);
    const [detailPolicy, setDetailPolicy] = useState<UpdateBackupPolicySchema | null>(null)
    const openModal = (policy: UpdateBackupPolicySchema) => {
        setDetailPolicy(policy);
        open()
    }
    // --- FETCH DATA ---
    const {data, isLoading} = useQuery({
        queryKey: ['policy'],
        queryFn: async () => {
            const res = await client.api.policy['all-policy'].$get();
            if (!res.ok) throw new Error('Failed to fetch all policy');
            return res.json();
        },
    });

    const backupPolicy: UpdateBackupPolicySchema[] = [
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
                    id: 0,
                    certification: null
                },
                repositoryId: 1,
                lastBackupTimestamp: 1769573950000,
                retentionPolicy: {
                    type: 'count',
                    windowType: 'daily',
                    countValue: 'unlimited'
                },
                schedulePolicy: '* * * * * *',
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
                    id: 0,
                    certification: {
                        b2: {

                        }
                    }
                },
                repositoryId: 2,
                lastBackupTimestamp: 1769573950000,
                retentionPolicy: {
                    type: 'duration',
                    windowType: 'hourly',
                    durationValue: "1y",
                },
                schedulePolicy: '* * * * * *',
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
                    schedulePolicy: '* * * * * *',
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
                    schedulePolicy: '* * * * * *',
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

                {/* by backupPolicy 展示汇总信息 */}
                <Grid gutter="xl">
                    {/* backup backupPolicy status */}
                    <Grid.Col span={{ md: 8 }}>
                        {isLoading ? ((
                            <Center h={400}>
                                <Loader size="xl"/>
                            </Center>
                        )) :
                            (<Grid gutter="md">
                            {data!.map((policy: UpdateBackupPolicySchema) => (
                                <Grid.Col span={{ sm: 4}}>
                                    <BackupPolicyCard policy={policy} onDetail={() => openModal(policy)} />
                                </Grid.Col>
                            ))}
                        </Grid>)}
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
            {/* Detail Modal */}
            {detailPolicy && <PolicyDetailModal opened={opened} onClose={close} data={detailPolicy} />}
        </Container>
    );
};

export default OverviewPage;
