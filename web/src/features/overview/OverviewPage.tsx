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
    // --- FETCH POLICY DATA ---
    const {data: policy, isLoading: isPolicyLoading} = useQuery({
        queryKey: ['policy'],
        queryFn: async () => {
            const res = await client.api.policy['all-policy'].$get();
            if (!res.ok) throw new Error('Failed to fetch all policy');
            return res.json();
        },
    });
    // --- FETCH ACTIVITY DATA ---
    const {data: activity, isLoading: isActivityLoading} = useQuery({
        queryKey: ['activity'],
        queryFn: async () => {
            const res = await client.api.info['activity'].$get();
            if (!res.ok) throw new Error('Failed to fetch all activity');
            return res.json();
        },
    });

    return (
        <Container fluid p={0}>
            <Stack gap="xl">
                {/* 三个卡片, 所有备份策略的 overview */}
                <StatsCardGroup activeCount={1} totalSize={100} complianceRate={1} />

                {/* by backupPolicy 展示汇总信息 */}
                <Grid gutter="xl">
                    {/* backup backupPolicy status */}
                    <Grid.Col span={{ md: 8 }}>
                        {isPolicyLoading ? ((
                            <Center h={400}>
                                <Loader size="xl"/>
                            </Center>
                        )) :
                            (<Grid gutter="md">
                            {policy!.map((policy: UpdateBackupPolicySchema) => (
                                <Grid.Col key={policy.strategy.id} span={{ sm: 4}}>
                                    <BackupPolicyCard policy={policy} onDetail={() => openModal(policy)} />
                                </Grid.Col>
                            ))}
                        </Grid>)}
                    </Grid.Col>

                    {/* 3. recent activity */}
                    {isActivityLoading ? (
                        <Center h={400}>
                            <Loader size="xl"/>
                        </Center>
                    ) : (
                        <Grid.Col span={{ md: 4 }}>
                            <RecentActivityCard activities={activity!} />
                        </Grid.Col>
                    )}

                </Grid>
            </Stack>
            {/* Detail Modal */}
            {detailPolicy && <PolicyDetailModal opened={opened} onClose={close} data={detailPolicy} />}
        </Container>
    );
};

export default OverviewPage;
