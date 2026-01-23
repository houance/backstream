import {Card, Text, Badge, Group, Stack, Progress, Tooltip, ActionIcon} from '@mantine/core';
import {IconAlertTriangle, IconCloud, IconDeviceSdCard} from '@tabler/icons-react';

// This represents the joined data of a Strategy + its Backup Targets & Repositories
interface BackupStrategyProps {
    strategy: {
        name: string;
        strategyType: "3-2-1" | "localCopy";
        targets: {
            repositoryId: number;
            repositoryName: string;
            providerType: "local" | "backblaze b2" | "aliyun oss";
            usage: number;
            capacity: number;
        }[];
    };
}

export function BackupStrategyCard({ strategy }: BackupStrategyProps) {
    // Determine if ANY repository is near capacity
    const isCritical = strategy.targets.some(t => (t.usage / t.capacity) > 0.8);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
                <div>
                    <Text fw={700} size="lg">{strategy.name}</Text>
                </div>
                <Badge color={isCritical ? "red" : "blue"} variant="light">
                    {strategy.strategyType}
                </Badge>
            </Group>

            <Text size="sm" fw={500} mb="xs" c="dimmed">Repository Health</Text>

            <Stack gap="sm">
                {strategy.targets.map((target) => {
                    const ratio = target.usage / target.capacity;
                    const percent = Math.round(ratio * 100);
                    const color = ratio > 0.9 ? 'red' : ratio > 0.7 ? 'orange' : 'blue';

                    return (
                        <div key={target.repositoryId}>
                            <Group justify="space-between" mb={4}>
                                <Group gap="xs">
                                    {target.providerType === 'local' ?
                                        <IconDeviceSdCard size={14} /> : <IconCloud size={14} />}
                                    <Text size="xs" fw={600}>{target.repositoryName}</Text>
                                </Group>
                                <Group gap={4}>
                                    <Text size="xs" c={color}>{percent}%</Text>
                                    {ratio > 0.9 && (
                                        <Tooltip label="Low space on this target">
                                            <IconAlertTriangle size={14} color="red" />
                                        </Tooltip>
                                    )}
                                </Group>
                            </Group>
                            <Progress value={percent} color={color} size="sm" radius="xl" />
                        </div>
                    );
                })}
            </Stack>

            <Group justify="space-between" mt="xl">
                <Text size="xs" c="dimmed">Last Backup: 2 hours ago</Text>
                <ActionIcon variant="subtle" size="sm" color="gray">
                    {/* Action icon for details */}
                </ActionIcon>
            </Group>
        </Card>
    );
}
