import React from 'react';
import { Grid, Card, Title, Text, Progress, List, Badge, Container } from '@mantine/core';
import {BackupStrategyCard} from "./components/BackupStrategyCard.tsx";

const OverviewPage: React.FC = () => {
    return (
        <Container fluid p={0}>
            {/* Storage Overview Card */}
            <Card shadow="sm" p="lg" radius="md" withBorder mb="xl">
                <Title order={3} mb="md">Total Storage Used</Title>
                <Text size="xl" fw={700}>
                    8.4 TB <Text span size="sm" c="dimmed">of 15 TB</Text>
                </Text>

                {/* usage bar */}
                <Progress.Root size="xl" mt="md">
                    <Progress.Section value={56}>
                        <Progress.Label>56%</Progress.Label>
                    </Progress.Section>
                </Progress.Root>
            </Card>

            <Grid gutter="xl">
                {/* backup policy status */}
                <Grid.Col span={{ md: 8 }}>
                    <Grid gutter="md">
                        <Grid.Col span={{ sm: 4 }}>
                            <BackupStrategyCard strategy={{
                                name: 'Music Collection',
                                strategyType: '3-2-1',
                                targets: [
                                    {
                                        repositoryName: 'local',
                                        providerType: 'local',
                                        usage: 500,
                                        capacity: 1000,
                                        repositoryId: 1
                                    },
                                    {
                                        repositoryName: 's3',
                                        providerType: 'backblaze b2',
                                        usage: 91,
                                        capacity: 100,
                                        repositoryId: 2
                                    }
                                ]
                            }}
                            />
                        </Grid.Col>
                    </Grid>
                </Grid.Col>

                {/* 3. recent activity */}
                <Grid.Col span={{ md: 4 }}>
                    <Card shadow="sm" p="lg" radius="md" withBorder>
                        <Title order={3} mb="md">Recent Activity</Title>
                        <List spacing="xs" size="sm" center>
                            <List.Item><b>Production Database</b> Backup completed successfully <Text size="xs" c="dimmed">2 minutes ago</Text></List.Item>
                            <List.Item><b>File Server</b> 1.2 TB transferred <Text size="xs" c="dimmed">1 hour ago</Text></List.Item>
                            <List.Item><b>Email Archive</b> Backup completed successfully <Text size="xs" c="dimmed">3 hours ago</Text></List.Item>
                            <List.Item><b>Storage Alert</b> Tape library at 82% capacity <Badge color="red" ml="xs">Alert</Badge> <Text size="xs" c="dimmed">8 hours ago</Text></List.Item>
                        </List>
                    </Card>
                </Grid.Col>
            </Grid>
        </Container>
    );
};

export default OverviewPage;
