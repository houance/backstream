import { SimpleGrid, Paper, Text } from '@mantine/core';
import {formatBytes} from "../../../util/format.ts";

interface StatsProps {
    activeCount: number,
    totalSize: number,
    successRate: number,
}

export function StatsCardGroup(statsProps : StatsProps ) {
    const stats = [
        { label: 'Active Strategies', value: statsProps.activeCount },
        { label: 'Protected Data', value: `${formatBytes(statsProps.totalSize)}` },
        { label: 'Backup Success Rate', value: `${statsProps.successRate * 100}%` },
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
