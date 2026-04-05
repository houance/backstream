import { useParams, useNavigate } from 'react-router-dom';
import {Container, Tabs, Button, Group, Title, Loader, Center, Stack, Paper, Box} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft } from '@tabler/icons-react';
import { client } from "../../api";

// Re-using your existing subcomponents
import SnapshotExplorer from './component/SnapshotsExplorer.tsx';
import OverviewTab from "./component/OverviewTab.tsx";
import PolicyActionCenter from "./component/PolicyActionCenter.tsx";
import OnGoingProcessFooter from "../../component/OnGoingProcessFooter.tsx";
import FailHistory from "./component/FailHistory.tsx";

export default function PolicyDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: policy, isLoading } = useQuery({
        queryKey: ['policy', id],
        queryFn: async () => {
            const res = await client.api.policy[':id'].$get({ param: { id: id! } });
            if (!res.ok) throw new Error('Failed to fetch policy');
            return res.json();
        },
        refetchInterval: 5000
    });

    const { data: onGoingProcess, isPending: isOnGoingProcessLoading } = useQuery({
        queryKey: ['policy-process', id],
        queryFn: async () => {
            const res = await client.api.policy['process'][':id'].$get({ param: { id: id! } });
            if (!res.ok) throw new Error('Failed to fetch policy on going process');
            return res.json();
        },
        refetchInterval: 5000,
    });
    const hasProcesses = !isOnGoingProcessLoading && onGoingProcess && onGoingProcess.length > 0;

    if (isLoading) return <Center h="100vh"><Loader size="xl" /></Center>;
    if (!policy) return <Center h="100vh">Policy not found</Center>;

    return (
        <Box style={{ position: 'relative', minHeight: '100vh'}}>
            <Container fluid p={0}>
                <Stack gap="lg">
                    {/* Header with Back Button */}
                    <Group justify="space-between">
                        <Group>
                            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(-1)}>
                                Back
                            </Button>
                            <Title order={2}>{policy.strategy.name}</Title>
                        </Group>
                    </Group>

                    <Paper withBorder p="md" radius="md">
                        <Tabs defaultValue="summary" variant="outline">
                            <Tabs.List>
                                <Tabs.Tab value="summary">Overview</Tabs.Tab>
                                <Tabs.Tab value="snapshots">Snapshots</Tabs.Tab>
                                <Tabs.Tab value="fail-history">Fail history</Tabs.Tab>
                                <Tabs.Tab value="actions">Actions</Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="summary" pt="md">
                                <OverviewTab policy={policy} />
                            </Tabs.Panel>
                            <Tabs.Panel value="snapshots" pt="md">
                                <SnapshotExplorer policy={policy} />
                            </Tabs.Panel>
                            <Tabs.Panel value="fail-history" pt="md">
                                <FailHistory policy={policy} />
                            </Tabs.Panel>
                            <Tabs.Panel value="actions" pt="md">
                                <PolicyActionCenter />
                            </Tabs.Panel>
                        </Tabs>
                    </Paper>
                </Stack>
            </Container>

            {/* --- FIXED PROGRESS FOOTER --- */}
            {hasProcesses && (
                <Box
                    style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                    }}
                >
                    <Stack gap={0}>
                        {onGoingProcess.map((snapshot) => (
                            <OnGoingProcessFooter key={snapshot.uuid} data={snapshot} />
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}