import { useNavigate, useParams } from 'react-router-dom';
import {Box, Container, Stack, Group, Button, Title, Paper, Tabs, Center, Loader} from '@mantine/core';
import { IconArrowLeft, IconInfoCircle, IconActivity, IconPlayerPlay } from '@tabler/icons-react';
// Import your sub-components
import { OverviewTab } from './component/OverviewTab';
import { FailHistoryTab } from './component/FailHistoryTab.tsx';
import ActionCenter from "./component/ActionCenter.tsx";
import {useQuery} from "@tanstack/react-query";
import {client} from "../../api";
import OnGoingProcessFooter from "../../component/OnGoingProcessFooter.tsx";

export default function StorageDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const { data: storageLocDetail, isPending: isDetailLoading } = useQuery({
        queryKey: ['storage-loc-detail', id],
        queryFn: async () => {
            const res = await client.api.storage['storage-detail'][':id'].$get({
                param: { id: id! }
            })
            if (!res.ok) throw new Error('Failed to fetch storage loc.');
            return res.json()
        },
        refetchInterval: 5000
    })

    const { data: onGoingProcess, isPending: isOnGoingProcessLoading } = useQuery({
        queryKey: ['storage-process', id],
        queryFn: async () => {
            const res = await client.api.storage['process'][':id'].$get({ param: { id: id! } });
            if (!res.ok) throw new Error('Failed to fetch storage on going process');
            return res.json();
        },
        refetchInterval: 5000,
    });
    const hasProcesses = !isOnGoingProcessLoading && onGoingProcess && onGoingProcess.length > 0;

    if (isDetailLoading) return <Center h="100vh"><Loader size="xl" /></Center>;
    if (!storageLocDetail) return <Center h="100vh">Storage not found</Center>;

    return (
        <Box style={{ position: 'relative', minHeight: '100vh' }}>
            <Container fluid p={0}>
                <Stack gap="lg">
                    {/* Header with Back Button */}
                    <Group justify="space-between">
                        <Group>
                            <Button
                                variant="subtle"
                                leftSection={<IconArrowLeft size={16} />}
                                onClick={() => navigate(-1)}
                            >
                                Back
                            </Button>
                            <Title order={2}>{storageLocDetail.repo.name}</Title>
                        </Group>
                    </Group>

                    <Paper withBorder p="md" radius="md">
                        <Tabs defaultValue="overview" variant="outline">
                            <Tabs.List>
                                <Tabs.Tab value="overview" leftSection={<IconInfoCircle size={14} />}>
                                    Overview
                                </Tabs.Tab>
                                <Tabs.Tab value="health" leftSection={<IconActivity size={14} />}>
                                    Fail History
                                </Tabs.Tab>
                                <Tabs.Tab value="action" leftSection={<IconPlayerPlay size={14} />}>
                                    Action Center
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="overview" pt="md">
                                <OverviewTab storage={storageLocDetail} />
                            </Tabs.Panel>

                            <Tabs.Panel value="health" pt="md">
                                <FailHistoryTab storage={storageLocDetail} />
                            </Tabs.Panel>

                            <Tabs.Panel value="action" pt="md">
                                <ActionCenter />
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
                        {onGoingProcess.map((exec) => (
                            <OnGoingProcessFooter key={exec.uuid} data={exec} />
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}
