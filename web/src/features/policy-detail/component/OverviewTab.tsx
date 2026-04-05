import {Badge, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import {type UpdateBackupPolicySchema, type UpdateRepositorySchema} from "@backstream/shared";
import {formatRetentionPolicy, formatTimestamp} from "../../../util/format.ts";
import type {ReactNode} from "react";

export function OverviewTab({ policy } : {policy: UpdateBackupPolicySchema}) {
    return (
        <Stack pt="md" gap="xl">
            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)">
                <Stack gap="xs">
                    <DetailRow label="Policy Name" value={policy.strategy.name} />
                    <DetailRow label="Data Source" value={policy.strategy.dataSource} />
                </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, md: 3 }}>
                <TargetCard policy={policy} />
            </SimpleGrid>
        </Stack>
    );
}

function getStatusUI(repo: UpdateRepositorySchema) {
    if (repo.linkStatus === 'UP' && repo.healthStatus === 'HEALTH') return { label: 'HEALTH', color: 'green' };
    if (repo.linkStatus === 'UP' && repo.healthStatus === 'INITIALIZING') return { label: 'INITIALIZING', color: 'yellow' };
    const label = repo.linkStatus === 'DOWN' ? 'DOWN' : repo.healthStatus;
    return { label: label, color: 'red' };
}

function TargetCard({ policy } : {policy: UpdateBackupPolicySchema}) {
    // Add "return" here so the component actually outputs the mapped array
    return policy.targets.map((target, index) => {
        const status = getStatusUI(target.repository);

        return (
            <Paper key={index} withBorder p="md" radius="md" mb="sm">
                <Group justify="flex-start" mb="sm">
                    <Badge variant="filled">Target {target.repository.name}</Badge>
                    <Badge variant="dot" color={status.color} size="sm">
                        {status.label}
                    </Badge>
                </Group>
                <Stack gap="xs">
                    <DetailRow label="Repo" value={target.repository.name} />
                    <DetailRow label="Retention" value={formatRetentionPolicy(target.retentionPolicy)} />
                    <DetailRow label="Schedule" value={target.job.cron} />
                    <DetailRow label="Last Run" value={
                        target.lastBackupAt ? formatTimestamp(target.lastBackupAt) : 'Never'
                    } />
                    <DetailRow label="Next Run" value={
                        target.job.nextRunAt ? formatTimestamp(target.job.nextRunAt) : 'Never'
                    } />
                </Stack>
            </Paper>
        );
    });
}


function DetailRow({
                       label,
                       value,
                       isMonospace
                   }: {
    label: string;
    value: ReactNode; // Changed from string to ReactNode
    isMonospace?: boolean
}) {
    return (
        <Group justify="apart" wrap="nowrap">
            <Text size="sm" fw={500}>{label}:</Text>
            {/* If value is a string, wrap it in Text; otherwise, render it directly */}
            {['string', 'number'].includes(typeof value) ? (
                <Text size="sm" c="dimmed" ff={isMonospace ? 'monospace' : undefined}>
                    {value}
                </Text>
            ) : (
                value
            )}
        </Group>
    );
}

export default OverviewTab;
