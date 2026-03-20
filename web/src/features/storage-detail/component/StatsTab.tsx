import { Paper, Text, Grid, Progress, Group, Stack } from '@mantine/core';

export function StatsTab() {
    return (
        <Stack gap="md">
            <Paper withBorder p="xl" radius="md">
                <Group justify="space-between" mb="xs">
                    <Text fw={600}>Deduplication Efficiency</Text>
                    <Text c="teal" fw={700} size="lg">75% Saved</Text>
                </Group>
                <Progress size="xl" value={75} color="teal" striped animated />
                <Text size="xs" c="dimmed" mt="sm">Your repository is saving 910 GB via restic deduplication.</Text>
            </Paper>

            <Grid grow>
                {[
                    { label: 'Restore Size', value: '1.2 TB', color: 'blue' },
                    { label: 'Disk Usage', value: '290 GB', color: 'green' },
                    { label: 'Total Blobs', value: '42,019', color: 'gray' },
                ].map((stat) => (
                    <Grid.Col key={stat.label} span={{ base: 12, sm: 4 }}>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{stat.label}</Text>
                            <Text size="h2" fw={700} c={stat.color}>{stat.value}</Text>
                        </Paper>
                    </Grid.Col>
                ))}
            </Grid>
        </Stack>
    );
}
