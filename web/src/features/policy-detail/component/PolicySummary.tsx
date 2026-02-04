import {Badge, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import type {UpdateBackupPolicySchema} from "@backstream/shared";
import {formatRetentionPolicy} from "../../../util/format.ts";

export function PolicySummary({ policy } : {policy: UpdateBackupPolicySchema}) {
    return (
        <Stack pt="md" gap="xl">
            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)">
                <Stack gap="xs">
                    <DetailRow label="Policy Name" value={policy.strategy.name} />
                    <DetailRow label="Data Source" value="/data/production/app-storage" />
                    <DetailRow label="Exclusions" value=".tmp, .log, cache/" />
                </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, md: 3 }}>
                {policy.targets.map((target, index) => (
                    <Paper key={index} withBorder p="md" radius="md">
                        <Group justify="apart" mb="sm">
                            <Badge variant="filled">Target {target.repository.name}</Badge>
                            <Badge color={target.repository.repositoryStatus === 'Active' ? 'green' : 'red'}>{target.repository.repositoryStatus}</Badge>
                        </Group>
                        <Stack gap="xs">
                            <DetailRow label="Repo" value={target.repository.name} />
                            <DetailRow label="Retention" value={formatRetentionPolicy(target.retentionPolicy)} />
                            <DetailRow label="Schedule" value={target.schedulePolicy} />
                            <DetailRow label="Last Run" value={
                                target.lastBackupTimestamp ? new Date(target.lastBackupTimestamp).toLocaleString() : 'Never'
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

export default PolicySummary;
