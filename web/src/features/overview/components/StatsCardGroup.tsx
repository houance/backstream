import { SimpleGrid, Paper, Text } from '@mantine/core';

interface StatsProps {
    activeCount: number,
    totalSize: number,
    complianceRate: number,
}

export function StatsCardGroup(statsProps : StatsProps ) {
    const stats = [
        { label: 'Active Strategies', value: statsProps.activeCount },
        { label: 'Protected Data', value: `${statsProps.totalSize} TB` },
        { label: '3-2-1 Compliance', value: `${statsProps.complianceRate * 100}%` },
    ];

    return (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
            {stats.map((stat) => (
                <Paper withBorder p="md" radius="lg" key={stat.label}>
                    <Text size="md" c="dimmed" fw={700} tt="uppercase">{stat.label}</Text>
                    <Text fw={700} size="xl">{stat.value}</Text>
                </Paper>
            ))}
        </SimpleGrid>
    );
}
