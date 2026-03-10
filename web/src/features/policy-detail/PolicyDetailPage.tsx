import { useParams, useNavigate } from 'react-router-dom';
import { Container, Tabs, Button, Group, Title, Loader, Center, Stack, Paper } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft } from '@tabler/icons-react';
import { client } from "../../api";

// Re-using your existing sub-components
import SnapshotExplorer from './component/SnapshotsExplorer.tsx';
import PolicySummary from "./component/PolicySummary.tsx";
import PolicyActionCenter from "./component/PolicyActionCenter.tsx";

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
    });

    if (isLoading) return <Center h="100vh"><Loader size="xl" /></Center>;
    if (!policy) return <Center h="100vh">Policy not found</Center>;

    return (
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
                            <Tabs.Tab value="summary">Summary</Tabs.Tab>
                            <Tabs.Tab value="snapshots">Snapshots</Tabs.Tab>
                            <Tabs.Tab value="actions">Actions</Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="summary" pt="md">
                            <PolicySummary policy={policy} />
                        </Tabs.Panel>
                        <Tabs.Panel value="snapshots" pt="md">
                            <SnapshotExplorer policy={policy} />
                        </Tabs.Panel>
                        <Tabs.Panel value="actions" pt="md">
                            <PolicyActionCenter />
                        </Tabs.Panel>
                    </Tabs>
                </Paper>
            </Stack>
        </Container>
    );
}