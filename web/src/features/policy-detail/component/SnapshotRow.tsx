import { Accordion, Group, Text, Badge, Loader, Paper, Stack, Grid, Center } from '@mantine/core';
import { IconClock, IconHistory, IconAlertCircle } from '@tabler/icons-react';
import {
    type OnGoingSnapshotsMetaSchema,
    type ScheduledSnapshotsMetaSchema,
    type FinishedSnapshotsMetaSchema,
    type SnapshotFile
} from '@backstream/shared';
import {FileBrowser} from "./FileBrowser.tsx";
import {calculateCountdown, formatTimestamp} from "../../../util/format.ts";
import {LogTerminal} from "./LogTerminal.tsx";

// Use your Zod types
type SnapshotUnion =
    | FinishedSnapshotsMetaSchema
    | OnGoingSnapshotsMetaSchema
    | ScheduledSnapshotsMetaSchema;

interface SnapshotRowProps {
    data: SnapshotUnion;
    files?: SnapshotFile[];
    isLoading?: boolean;
}

export function SnapshotRow({ data, files, isLoading }: SnapshotRowProps) {
    // 1. Identify the snapshot type based on your Zod status values
    const isOngoing = data.status === 'running' || data.status === 'pending';
    const isScheduled = data.status === 'scheduled';
    const isFinished = !isOngoing && !isScheduled;

    const toClampedPercent = (value: number | undefined): string => {
        if (!value) return `0%`
        // 1. Convert decimal to whole percentage
        const percentage = value * 100;

        // 2. Clamp between 0 and 100
        const clamped = Math.min(Math.max(percentage, 0), 100);

        return `${clamped.toFixed(2)}%`;
    };

    // 2. Map visual configuration
    const config = {
        // Unique ID varies between schemas: 'snapshotsId' vs 'uuid'
        id: isFinished ? (data as FinishedSnapshotsMetaSchema).snapshotId :
            (data as ScheduledSnapshotsMetaSchema | OnGoingSnapshotsMetaSchema).uuid,

        icon: isOngoing ? (
            <Loader size="xs" color="blue" />
        ) : isScheduled ? (
            <IconClock size={16} color="var(--mantine-color-gray-5)" />
        ) : data.status === 'partial' ? (
            <IconAlertCircle size={16} color="red" />
        ) : (
            <IconHistory size={16} color="var(--mantine-color-green-5)" />
        ),

        border: isOngoing
            ? '4px solid var(--mantine-color-blue-6)'
            : isScheduled
                ? '4px dashed var(--mantine-color-gray-4)'
                : '4px solid var(--mantine-color-green-6)',

        badge: isOngoing ? (
            <Badge variant="dot" size="sm">{`Running (${toClampedPercent((data as OnGoingSnapshotsMetaSchema).progress?.percent)})`}</Badge>
        ) : isScheduled ? (
            <Badge variant="outline" color="gray" size="sm">Scheduled</Badge>
        ) : (
            <Badge variant="light" color={data.status === 'success' ? 'green' : 'orange'} size="sm">
                {data.status.toUpperCase()}
            </Badge>
        ),

        timeLabel: isScheduled
            ? `Starts in ${calculateCountdown(data.createdAtTimestamp)}`
            : isOngoing ? "Started" : "Created"
    };

    return (
        <Accordion.Item value={config.id} style={{ borderLeft: config.border }}>
            <Accordion.Control>
                <Grid justify="flex-start" align="center" gutter="xs" pr="md">
                    {/* 1. Icon Section */}
                    <Grid.Col span="content">
                        <Center w={24}> {config.icon} </Center>
                    </Grid.Col>
                    {/* 2. ID & Badge Section */}
                    <Grid.Col span={10}>
                        <Group gap="xs" wrap="nowrap">
                            <Text
                                fw={700}
                                ff="monospace"
                                size="sm"
                                c={isFinished ? 'dark' : 'dimmed'}
                                w={80} // <--- Fixed width ensures the badge starts at the same spot
                            >
                                {config.id.slice(0, 8)}
                            </Text>
                            {config.badge}
                        </Group>
                    </Grid.Col>
                    {/* 3. Time Section */}
                    <Grid.Col span="auto">
                        <Stack gap={0} align="flex-start">
                            <Text size="xs" fw={600} c={isOngoing ? 'blue' : 'dimmed'} lh={1.2}>
                                {config.timeLabel}
                            </Text>
                            <Text size="xs" c="dimmed" lh={1.2}>
                                {formatTimestamp(data.createdAtTimestamp)}
                            </Text>
                        </Stack>
                    </Grid.Col>
                </Grid>
            </Accordion.Control>


            <Accordion.Panel>
                {isScheduled && (
                    <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-gray-0)">
                        <Text size="xs" c="dimmed" ta="center">Scheduled snapshot. No logs or files available yet.</Text>
                    </Paper>
                )}

                {isOngoing && (
                    <LogTerminal logs={(data as OnGoingSnapshotsMetaSchema).progress?.logs} />
                )}

                {isFinished && (
                    <Stack>
                        {isLoading ? (
                            <Center p="xl"><Loader size="sm" /></Center>
                        ) : (
                            <FileBrowser flatFiles={files || []} />
                        )}
                    </Stack>
                )}
            </Accordion.Panel>
        </Accordion.Item>
    );
}
