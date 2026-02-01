import {Card, Text, Badge, Group, Stack, Progress, Tooltip, Box} from '@mantine/core';
import {IconAlertTriangle, IconCloud, IconDeviceSdCard} from '@tabler/icons-react';
import {getRepositoryStats} from "../../../util/format.ts";

// This represents the joined data of a Strategy + its Backup Targets & Repositories
interface BackupStrategyProps {
    strategy: {
        name: string;
        strategyType: string;
        dataSource: string;
        targets: {
            repositoryId: number;
            repositoryName: string;
            targetType: string;
            usage: number;
            capacity: number;
            lastBackupTimestamp: number;
        }[];
    };
}

export function BackupStrategyCard({ strategy }: BackupStrategyProps) {
    // Determine if ANY repository is near capacity
    const isCritical = strategy.targets.some(t => (t.usage / t.capacity) > 0.8);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            {/* 备份计划名称和类型  */}
            <Group justify="space-between" mb="md">
                <div>
                    <Tooltip label={strategy.dataSource}>
                        <Text fw={700} size="lg">{strategy.name}</Text>
                    </Tooltip>
                </div>
                <Badge color={isCritical ? "red" : "blue"} variant="light">
                    {strategy.strategyType}
                </Badge>
            </Group>

            {/* 备份目标健康度 */}
            <Text size="sm" fw={500} mb="xs" c="dimmed">Backup Target Health</Text>
            {/* by 备份目标展示 progress 和 backup time */}
            <Stack gap="sm">
                {strategy.targets.map((target) => {
                    const { percentage } = getRepositoryStats(target.usage, target.capacity);

                    return (
                        <Box key={target.repositoryId}>
                            <Group justify="space-between" mb={4}>
                                {/* 空间条上方文字和 icon: target name + target type */}
                                <Group gap="xs">
                                    {target.targetType === 'local' ?
                                        <IconDeviceSdCard size={16} /> :
                                        <IconCloud size={16} />}
                                    <Text size="xs" fw={600}>{target.repositoryName}</Text>
                                </Group>
                                {/* 空间条上方, 当空间不足的时候展示三角形警告 icon */}
                                <Group gap={4}>
                                    {percentage > 90 && (
                                        <Tooltip label="Low space on this target">
                                            <IconAlertTriangle size={14} color="red" />
                                        </Tooltip>
                                    )}
                                </Group>
                            </Group>
                            {/* 空间条 */}
                            <Progress.Root size="lg" radius="xl">
                                <Progress.Section
                                    value={percentage}
                                    color={percentage > 90 ? 'red' : percentage > 80 ? 'orange' : 'blue'}
                                    striped={percentage > 80}
                                >
                                    <Progress.Label>
                                        {percentage.toFixed(1)}%
                                    </Progress.Label>
                                </Progress.Section>
                            </Progress.Root>
                            {/* 空间条下方的 lastBackupTime */}
                            <Text size="xs" c="dimmed" mb={4}>
                                Last backup: {target.lastBackupTimestamp ?
                                new Date(target.lastBackupTimestamp).toLocaleString() :
                                'Never'}
                            </Text>
                        </Box>
                    );
                })}
            </Stack>
        </Card>
    );
}
