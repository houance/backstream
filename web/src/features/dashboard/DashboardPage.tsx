import React from 'react';
import { Grid, Card, Title, Text, Progress, List, Badge, Container, Box } from '@mantine/core';
import ServerStatusPanel from './components/ServerStatusPanel';

const DashboardPage: React.FC = () => {
    return (
        <Container fluid p={0}>
            {/* Add a specific header/title section at the top of the page */}
            <Box mb="xl" h="60" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title order={1}>Overview</Title>
            </Box>

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
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="Production Database" type="3-2-1" lastBackup="2 min" nextRun="11:00" /></Grid.Col>
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="File Server" type="local-backup" lastBackup="1 hour" nextRun="2:00" /></Grid.Col>
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="Email Archive" type="local-mirror" lastBackup="3 hours" nextRun="6:00" /></Grid.Col>
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="Development Server" type="remote-mirror" lastBackup="5 hours" nextRun="8:00" /></Grid.Col>
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="Customer Data" type="remote-backup" lastBackup="6 hours" nextRun="1:00" /></Grid.Col>
                        <Grid.Col span={{ sm: 4 }}><ServerStatusPanel title="Application Logs" type="3-2-1" lastBackup="4 hours" nextRun="10:00" /></Grid.Col>
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

export default DashboardPage;
