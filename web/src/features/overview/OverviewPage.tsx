import {useMemo, useState} from 'react';
import {Grid, Container, Stack, Center, Loader, Group, TextInput, Title} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";

import { PolicyCard } from "./components/PolicyCard.tsx";
import { StatsCardGroup } from "./components/StatsCardGroup.tsx";
import { RecentActivityCard } from "./components/RecentActivityCard.tsx";
import type { UpdateBackupPolicySchema } from '@backstream/shared';

import { client } from "../../api";
import { ensureSuccess } from "../../util/api.ts";
import { notice } from "../../util/notification.tsx";
import {IconSearch} from "@tabler/icons-react";

export function OverviewPage()  {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    // 3. Policy Name Search State
    const [searchQuery, setSearchQuery] = useState('');

    // --- FETCH POLICY DATA ---
    const { data: policy, isLoading: isPolicyLoading } = useQuery({
        queryKey: ['policy'],
        queryFn: async () => {
            const res = await client.api.policy['all-policy'].$get();
            if (!res.ok) throw new Error('Failed to fetch all policy');
            return res.json();
        },
    });
    // 4. Memoized Filtered Data
    const filteredPolicies = useMemo(() => {
        if (!policy) return [];
        return policy.filter((p: UpdateBackupPolicySchema) =>
            p.strategy.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [policy, searchQuery]);

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
        refetchInterval: 5000,
        placeholderData: keepPreviousData
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

    if (isPolicyLoading || isActivityLoading || isStatsLoading) {
        return (
            <Center h={400}><Loader size="xl" /></Center>
        )
    }

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
                        <Stack gap="md">
                            {/* 5. Search Panel */}
                            <Group justify="space-between" align="flex-end">
                                <Title order={4}>Backup Policies</Title>
                                <TextInput
                                    placeholder="Search by name..."
                                    leftSection={<IconSearch size={16} />}
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                                    style={{ flex: 1, maxWidth: 300 }}
                                />
                            </Group>

                            <Grid gutter="md">
                                {/* 6. Map through filteredPolicies instead of policy */}
                                {filteredPolicies.map((policy: UpdateBackupPolicySchema) => (
                                    <Grid.Col key={policy.strategy.id} span={{ sm: 4 }}>
                                        <PolicyCard
                                            policy={policy}
                                            onDetail={() => navigate(`/policy/${policy.strategy.id}`)}
                                            onDelete={(p) => mutate.mutate(p)}
                                            isDeleting={mutate.isPending}
                                        />
                                    </Grid.Col>
                                ))}
                                {filteredPolicies.length === 0 && (
                                    <Grid.Col span={12}>
                                        <Center h={100}>No policies match your search.</Center>
                                    </Grid.Col>
                                )}
                            </Grid>
                        </Stack>
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
}

export default OverviewPage;
