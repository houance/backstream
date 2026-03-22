import {Badge, Group, Paper, SimpleGrid, Stack, Text} from "@mantine/core";
import type {ReactNode} from "react";

export function OverviewTab() {
    return (
        <Stack pt="md" gap="xl">
            {/* Header - Unified Blue Identity */}
            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)">
                <Stack gap={4}>
                    <DetailRow
                        label="Status"
                        value={<Badge variant="dot" color="green" size="sm">Active</Badge>}
                    />
                    <DetailRow label="Type" value="S3 Compatible (Minio)" />
                    <DetailRow label="Endpoint" value="https://s3.example.com" />
                    <DetailRow label="Format" value="v2 (Compression)" />
                    <DetailRow label="Full Hash" value="7b2a9f4...28394" isMonospace />
                </Stack>
            </Paper>

            {/* Content Grid - Clean Monochrome Style */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">

                {/* 1. Storage & Efficiency */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Storage</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Disk Usage" value="290 GB" />
                        <DetailRow label="Restore Size" value="1.2 TB" />
                        <DetailRow label="Deduplication" value="75% Saved" />
                    </Stack>
                </Paper>

                {/* 2. Data Structure */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Index</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Snapshots" value="142" />
                        <DetailRow label="Total Blobs" value="42,019" />
                        <DetailRow label="Unique Data" value="215 GB" />
                    </Stack>
                </Paper>

                {/* 3. Maintenance / Activity */}
                <Paper withBorder p="md" radius="md">
                    <Badge variant="light" color="indigo" mb="sm">Maintenance</Badge>
                    <Stack gap="xs">
                        <DetailRow label="Last Check" value="2 hours ago" />
                        <DetailRow label="Last Prune" value="Yesterday" />
                        <DetailRow label="Cache Size" value="4.2 GB" />
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
            {typeof value === 'string' ? (
                <Text size="sm" c="dimmed" ff={isMonospace ? 'monospace' : undefined}>
                    {value}
                </Text>
            ) : (
                value
            )}
        </Group>
    );
}
