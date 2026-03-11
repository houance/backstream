import { Accordion, Group, Text, Badge, Loader, Center, Box } from '@mantine/core';
import { IconHistory, IconAlertCircle } from '@tabler/icons-react';
import {
    type FinishedSnapshotsMetaSchema,
    type SnapshotFile
} from '@backstream/shared';
import {FileBrowser} from "./FileBrowser.tsx";
import {formatTimestamp} from "../../../util/format.ts";


interface SnapshotRowProps {
    data: FinishedSnapshotsMetaSchema;
    files: SnapshotFile[];
    isLoading: boolean;
    onDownload: (file: SnapshotFile) => void;
    isDownloading: boolean;
}

export function SnapshotRow({ data, files, isLoading, onDownload, isDownloading }: SnapshotRowProps) {
    const isPartial = data.status === 'partial';

    // Status-based coloring
    const statusColor = isPartial ? 'orange' : 'green';

    return (
        <Accordion.Item
            value={data.snapshotId}
            style={{
                // 1. Unified border with status-colored accent on the left
                border: '1px solid var(--mantine-color-default-border)',
                borderLeft: `4px solid var(--mantine-color-${statusColor}-filled)`,
                borderRadius: 'var(--mantine-radius-md)',
                marginBottom: 'var(--mantine-spacing-xs)',
                backgroundColor: 'var(--mantine-color-body)',
                overflow: 'hidden'
            }}
        >
            <Accordion.Control
                px="md"
                py={6} // 2. Compact height
                style={{ '&:hover': { backgroundColor: 'var(--mantine-color-gray-0)' } }}
            >
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        {/* Status Icon */}
                        <Center w={20}>
                            {isPartial ? (
                                <IconAlertCircle size={16} color="var(--mantine-color-orange-6)" />
                            ) : (
                                <IconHistory size={16} color="var(--mantine-color-green-6)" />
                            )}
                        </Center>

                        {/* ID Section */}
                        <Text fw={700} ff="monospace" size="sm" c="var(--mantine-color-text)">
                            {data.snapshotId.slice(0, 8).toUpperCase()}
                        </Text>

                        {/* 3. Conditional Badge: Only shows if NOT successful */}
                        {isPartial && (
                            <Badge
                                variant="light"
                                color="orange"
                                size="xs"
                                radius="sm"
                                tt="uppercase"
                            >
                                Partial
                            </Badge>
                        )}
                    </Group>

                    {/* Time Section: Single line for height efficiency */}
                    <Group gap={4} wrap="nowrap">
                        <Text size="xs" c="dimmed" fw={600}>CREATED:</Text>
                        <Text size="xs" fw={500} c="var(--mantine-color-text)">
                            {formatTimestamp(data.createdAtTimestamp)}
                        </Text>
                    </Group>
                </Group>
            </Accordion.Control>

            <Accordion.Panel>
                <Box
                    mt="xs"
                    pt="md"
                    style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                    {isLoading ? (
                        <Center p="xl"><Loader size="sm" variant="dots" /></Center>
                    ) : (
                        <FileBrowser
                            flatFiles={files}
                            onDownload={onDownload}
                            isDownloading={isDownloading}
                        />
                    )}
                </Box>
            </Accordion.Panel>
        </Accordion.Item>
    );
}

