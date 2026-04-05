import { Card, Text, Badge, Group, Stack, Progress, Tooltip, Box, ActionIcon } from '@mantine/core';
import { IconAlertTriangle, IconCloud, IconDeviceSdCard, IconTrash } from '@tabler/icons-react';
import { formatTimestamp, getRepositoryStats } from "../../../util/format.ts";
import { type UpdateBackupPolicySchema } from '@backstream/shared'

export function PolicyCard({ policy, onDetail, onDelete, isDeleting }: {
    policy: UpdateBackupPolicySchema,
    onDetail: () => void,
    onDelete: (policy: UpdateBackupPolicySchema) => void,
    isDeleting: boolean
}) {
    const MAX_VISIBLE_TARGETS = 3;
    const isCritical = policy.targets.some(t => {
        const size = t.repository?.size ?? 0;
        const capacity = t.repository?.capacity;

        // Avoid division by zero or undefined capacity
        if (!capacity) return false;

        return (size / capacity) > 0.8;
    });

    // Slice targets for display
    const visibleTargets = policy.targets.slice(0, MAX_VISIBLE_TARGETS);
    const remainingCount = policy.targets.length - MAX_VISIBLE_TARGETS;

    return (
        <Card shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              component="button"
              onClick={onDetail}
              style={{
                  width: '100%',
                  height: '100%', // Ensure card fills Grid.Col height
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column'
              }}>

            {/* Header section remains the same */}
            <Group justify="space-between" mb="md" wrap="nowrap">
                <Box style={{ flex: 1 }}>
                    <Tooltip label={policy.strategy.dataSource}>
                        <Text fw={700} size="lg" truncate>{policy.strategy.name}</Text>
                    </Tooltip>
                </Box>

                <Group gap="xs">
                    <Badge color={isCritical ? "red" : "blue"} variant="light" size="sm">
                        {policy.strategy.strategyType}
                    </Badge>

                    <ActionIcon
                        variant="subtle"
                        color="red"
                        loading={isDeleting}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(policy);
                        }}
                    >
                        <IconTrash size={18} />
                    </ActionIcon>
                </Group>
            </Group>

            <Text size="sm" fw={500} mb="xs" c="dimmed">Backup Target Health</Text>

            <Stack gap="sm" style={{ flex: 1 }}>
                {visibleTargets.map((target) => {
                    const { percentage } = getRepositoryStats(target.repository.size, target.repository.capacity || Infinity);

                    return (
                        <Box key={target.repositoryId}>
                            <Group justify="space-between" mb={4}>
                                <Group gap="xs">
                                    {target.repository.repositoryType === 'LOCAL' ?
                                        <IconDeviceSdCard size={16} /> :
                                        <IconCloud size={16} />}
                                    <Text size="xs" fw={600} truncate maw={120}>{target.repository.name}</Text>
                                </Group>
                                <Group gap={4}>
                                    {percentage > 90 && (
                                        <IconAlertTriangle size={14} color="var(--mantine-color-red-filled)" />
                                    )}
                                </Group>
                            </Group>

                            <Progress.Root size="lg" radius="xl">
                                <Progress.Section
                                    value={percentage}
                                    color={percentage > 90 ? 'red' : percentage > 80 ? 'orange' : 'blue'}
                                    striped={percentage > 80}
                                >
                                    <Progress.Label>{percentage.toFixed(0)}%</Progress.Label>
                                </Progress.Section>
                            </Progress.Root>

                            <Text size="xs" c="dimmed" mt={2}>
                                {target.lastBackupAt ? formatTimestamp(target.lastBackupAt) : 'Never'}
                            </Text>
                        </Box>
                    );
                })}

                {/* The "+X More" Indicator */}
                {remainingCount > 0 && (
                    <Group justify="center" gap={4} mt="auto" pt="xs">
                        <Badge variant="dot" color="gray" size="sm">
                            +{remainingCount} more targets
                        </Badge>
                    </Group>
                )}
            </Stack>
        </Card>
    );
}
