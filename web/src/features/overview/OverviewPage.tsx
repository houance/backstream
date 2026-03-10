import React from 'react';
import { Grid, Container, Stack, Center, Loader } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackupPolicyCard } from "./components/BackupPolicyCard.tsx";
import { StatsCardGroup } from "./components/StatsCardGroup.tsx";
import { RecentActivityCard } from "./components/RecentActivityCard.tsx";
import type { UpdateBackupPolicySchema } from '@backstream/shared';

import { client } from "../../api";
import { ensureSuccess } from "../../util/api.ts";
import { notice } from "../../util/notification.tsx";

const OverviewPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // --- FETCH POLICY DATA ---
    const { data: policy, isLoading: isPolicyLoading } = useQuery({
        queryKey: ['policy'],
        queryFn: async () => {
            const res = await client.api.policy['all-policy'].$get();
            if (!res.ok) throw new Error('Failed to fetch all policy');
            return res.json();
        },
    });

    // --- DELETE POLICY ---
    const mutate = useMutation(({
        mutationFn: async (policy: UpdateBackupPolicySchema) => {
            return ensureSuccess(
                client.api.policy[':id'].$delete({
                    param: { id: policy.strategy.id.toString() }
                })
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['policy'] });
            notice(true, 'policy delete success');
        },
        onError: (error) => notice(false, `${String(error)}`)
    }))

    // --- FETCH ACTIVITY DATA ---
    const { data: activity, isLoading: isActivityLoading } = useQuery({
        queryKey: ['activity'],
        queryFn: async () => {
            const res = await client.api.info['activity'].$get();
            if (!res.ok) throw new Error('Failed to fetch all activity');
            return res.json();
        },
    });

    // --- FETCH STATS DATA ---
    const { data: stats, isLoading: isStatsLoading } = useQuery({
        queryKey: ['stats'],
        queryFn: async () => {
            const res = await client.api.info['stats'].$get();
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        },
    });

    return (
        <Container fluid p={0}>
            <Stack gap="xl">
                {isStatsLoading ? (
                    <Center h={400}><Loader size="xl" /></Center>
                ) : (
                    <StatsCardGroup
                        activeCount={stats!.activeCount}
                        totalSize={stats!.totalSize}
                        successRate={stats!.successRate}
                    />)
                }

                <Grid gutter="xl">
                    <Grid.Col span={{ md: 8 }}>
                        {isPolicyLoading ? (
                            <Center h={400}><Loader size="xl" /></Center>
                        ) : (
                            <Grid gutter="md">
                                {policy!.map((policy: UpdateBackupPolicySchema) => (
                                    <Grid.Col key={policy.strategy.id} span={{ sm: 4 }}>
                                        <BackupPolicyCard
                                            policy={policy}
                                            onDetail={() => navigate(`/policy/${policy.strategy.id}`)}
                                            onDelete={(p) => mutate.mutate(p)}
                                            isDeleting={mutate.isPending}
                                        />
                                    </Grid.Col>
                                ))}
                            </Grid>
                        )}
                    </Grid.Col>

                    <Grid.Col span={{ md: 4 }}>
                        {isActivityLoading ? (
                            <Center h={400}><Loader size="xl" /></Center>
                        ) : (
                            <RecentActivityCard activities={activity!} />
                        )}
                    </Grid.Col>
                </Grid>
            </Stack>
        </Container>
    );
};

export default OverviewPage;
