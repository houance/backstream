import { useNavigate, useParams } from 'react-router-dom';
import { Box, Container, Stack, Group, Button, Title, Paper, Tabs } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle, IconActivity, IconPlayerPlay } from '@tabler/icons-react';
// Import your sub-components
import { OverviewTab } from './component/OverviewTab';
import { HealthLogTab } from './component/HealthLogTab';
import ActionCenter from "./component/ActionCenter.tsx";

export default function StorageDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    // Mock data - replace with your actual repository fetching logic
    const repoName = "jing-dong-cloud";

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
                            <Title order={2}>{repoName}</Title>
                        </Group>
                    </Group>

                    <Paper withBorder p="md" radius="md">
                        <Tabs defaultValue="overview" variant="outline">
                            <Tabs.List>
                                <Tabs.Tab value="overview" leftSection={<IconInfoCircle size={14} />}>
                                    Overview
                                </Tabs.Tab>
                                <Tabs.Tab value="health" leftSection={<IconActivity size={14} />}>
                                    Health Log
                                </Tabs.Tab>
                                <Tabs.Tab value="action" leftSection={<IconPlayerPlay size={14} />}>
                                    Action Center
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="overview" pt="md">
                                <OverviewTab />
                            </Tabs.Panel>

                            <Tabs.Panel value="health" pt="md">
                                <HealthLogTab />
                            </Tabs.Panel>

                            <Tabs.Panel value="action" pt="md">
                                <ActionCenter />
                            </Tabs.Panel>
                        </Tabs>
                    </Paper>
                </Stack>
            </Container>

            {/* Note: Logic for OngoingProcessFooter can be added here if
                repo maintenance tasks (Prune/Check) are trackable */}
        </Box>
    );
}
