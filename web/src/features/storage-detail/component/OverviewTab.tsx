import {Badge, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import type {ReactNode} from "react";
import type {UpdateRepoScheduleSchema, UpdateRepositorySchema} from "@backstream/shared";
import {calPercentage, formatBytes, formatTimestamp} from "../../../util/format.ts";

export function OverviewTab({ storage }: {
    storage: {
        repo: UpdateRepositorySchema,
        snapshotCount: number,
        snapshotSize: number,
        checkJob: UpdateRepoScheduleSchema,
        pruneJob: UpdateRepoScheduleSchema,
        lastCheckTimestamp: number | null,
        lastPruneTimestamp: number | null,
    }
}) {

    const repo = storage.repo;

    // Map status to specific Mantine colors
    const getStatusUI = () => {
        if (repo.linkStatus === 'UP' && repo.healthStatus === 'HEALTH') return { label: 'HEALTH', color: 'green' };
        if (repo.linkStatus === 'UP' && repo.healthStatus === 'INITIALIZING') return { label: 'INITIALIZING', color: 'yellow' };
        const label = repo.linkStatus === 'DOWN' ? 'DOWN' : repo.healthStatus;
        return { label: label, color: 'red' };
    }
    const status = getStatusUI();

    return (
        <Stack pt="md" gap="xl">
            {/* Header - Unified Blue Identity */}
            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)">
                <Stack gap={4}>
                    <DetailRow
                        label="Status"
                        value={
                        <Badge variant="dot" color={status.color} size="sm">
                            {status.label}
                        </Badge>
                    }
                    />
                    <DetailRow label="Type" value={repo.repositoryType} />
                    <DetailRow label="Path" value={repo.path} />
                    <DetailRow label="Version" value={`V${repo.version}`} />
                </Stack>
            </Paper>

            {/* Content Grid - Clean Monochrome Style */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">

                {/* 1. Storage & Efficiency */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Storage</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Disk Usage" value={formatBytes(repo.size)} />
                        <DetailRow label="Restore Size" value={formatBytes(storage.snapshotSize)} />
                        <DetailRow label="Efficiency" value={calPercentage(repo.size, storage.snapshotSize, true) + ` (${formatBytes(storage.snapshotSize - (repo.size??0))} Saved)`} />
                    </Stack>
                </Paper>

                {/* 2. Data Structure */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Index</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Snapshots" value={storage.snapshotCount} />
                        <DetailRow label="Total Blobs" value={repo.blobCount} />
                    </Stack>
                </Paper>

                {/* 3. Maintenance / Activity */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Maintenance</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Check Schedule" value={storage.checkJob.cron} />
                        <DetailRow label="Last Check" value={formatTimestamp(storage.lastCheckTimestamp)} />
                        <DetailRow label="Prune Schedule" value={storage.pruneJob.cron} />
                        <DetailRow label="Last Prune" value={formatTimestamp(storage.lastPruneTimestamp)} />
                    </Stack>
                </Paper>

            </SimpleGrid>
        </Stack>
    );
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
