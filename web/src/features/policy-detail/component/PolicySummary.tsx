import {Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Tooltip} from "@mantine/core";
import {type UpdateBackupPolicySchema, type UpdateRepositorySchema} from "@backstream/shared";
import {formatRetentionPolicy, formatTimestamp} from "../../../util/format.ts";
import {IconCircleCheck, IconDatabaseExclamation, IconPlayerPause, IconWorldOff} from "@tabler/icons-react";

export function PolicySummary({ policy } : {policy: UpdateBackupPolicySchema}) {
    return (
        <Stack pt="md" gap="xl">
            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)">
                <Stack gap="xs">
                    <DetailRow label="Policy Name" value={policy.strategy.name} />
                    <DetailRow label="Data Source" value={policy.strategy.dataSource} />
                </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, md: 3 }}>
                {policy.targets.map((target, index) => (
                    <Paper key={index} withBorder p="md" radius="md">
                        <Group justify="apart" mb="sm">
                            <Badge variant="filled">Target {target.repository.name}</Badge>
                            <RepoStatus repo={target.repository} />
                        </Group>
                        <Stack gap="xs">
                            <DetailRow label="Repo" value={target.repository.name} />
                            <DetailRow label="Retention" value={formatRetentionPolicy(target.retentionPolicy)} />
                            <DetailRow label="Schedule" value={target.schedulePolicy} />
                            <DetailRow label="Last Run" value={
                                target.lastBackupAt ? formatTimestamp(target.lastBackupAt) : 'Never'
                            } />
                            <DetailRow label="Next Run" value={
                                target.nextBackupAt ? formatTimestamp(target.nextBackupAt) : 'Never'
                            } />
                        </Stack>
                    </Paper>
                ))}
            </SimpleGrid>
        </Stack>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <Group justify="apart">
            <Text size="sm" fw={500}>{label}:</Text>
            <Text size="sm" c="dimmed">{value}</Text>
        </Group>
    );
}

function RepoStatus({ repo }: { repo: UpdateRepositorySchema }) {
    // 1. Logic for Admin State (Highest Priority for UI)
    if (repo.adminStatus === 'PAUSED') {
        return (
            <Tooltip label="User has paused this repository">
                <Badge color="gray" leftSection={<IconPlayerPause size={12} />} variant="outline">Paused</Badge>
            </Tooltip>
        );
    }

    return (
        <Group gap={5}>
            {/* 2. Health Status (Integrity) */}
            <Tooltip label={repo.healthStatus === 'HEALTH' ? 'Data Integrity OK' : 'Data Corruption Detected!'}>
                <Badge
                    color={repo.healthStatus === 'HEALTH' ? 'green' : 'red'}
                    variant="light"
                    leftSection={repo.healthStatus === 'HEALTH' ? <IconCircleCheck size={12} /> : <IconDatabaseExclamation size={12} />}
                >
                    {repo.healthStatus}
                </Badge>
            </Tooltip>

            {/* 3. Link Status (Connectivity) */}
            <Tooltip label={repo.linkStatus === 'UP' ? 'Connected' : 'Network/Auth Error'}>
                <ThemeIcon
                    size="sm"
                    radius="xl"
                    variant="transparent"
                    color={repo.linkStatus === 'UP' ? 'green' : 'orange'}
                >
                    {repo.linkStatus === 'UP' ? <IconCircleCheck size={16} /> : <IconWorldOff size={16} />}
                </ThemeIcon>
            </Tooltip>
        </Group>
    );
};

export default PolicySummary;
