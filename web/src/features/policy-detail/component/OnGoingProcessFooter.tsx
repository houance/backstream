import { Box, Progress, Group, Text, UnstyledButton, Modal, Badge, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTerminal2 } from '@tabler/icons-react';
import type {OnGoingBackupProcess} from "@backstream/shared";
import {formatBytes, formatPercentage} from "../../../util/format.ts";
import {LogTerminal} from "../../../component/LogTerminal.tsx";

export default function OnGoingProcessFooter({ data }: { data: OnGoingBackupProcess }) {
    const [opened, { open, close }] = useDisclosure(false);

    // Destructure with schema-based fallbacks
    const { repoName, commandType, status, progress, uuid } = data;
    const percent = progress?.percent ?? 0;
    const bytesDone = progress?.bytesDone ?? 0;
    const totalBytes = progress?.totalBytes ?? 0;
    const logs = progress?.logs ?? [];

    return (
        <>
            <Box
                style={{
                    borderTop: '1px solid var(--mantine-color-default-border)',
                    backgroundColor: 'var(--mantine-color-body)'
                }}
            >
                {/* Underline Progress Bar */}
                <Progress
                    value={formatPercentage(percent)}
                    size={3}
                    radius={0}
                    animated={status === 'running'}
                    color={status === 'pending' ? 'gray' : 'blue'}
                />

                <Group justify="space-between" px="md" py={5} gap="xs">
                    <Group gap="sm" style={{ flex: 1 }}>
                        {/* Human-readable Repo Name */}
                        <Tooltip label={`UUID: ${uuid}`} position="top-start" withArrow>
                            <Badge variant="light" size="sm" color="blue" radius="sm">
                                {commandType} on {repoName}
                            </Badge>
                        </Tooltip>

                        <Text size="xs" fw={500} c={status === 'pending' ? 'dimmed' : 'blue'}>
                            {status === 'pending' ? (
                                'Queued...'
                            ) : (
                                `${percent}% (${formatBytes(bytesDone)} / ${formatBytes(totalBytes)})`
                            )}
                        </Text>
                    </Group>

                    {/* Terminal Action */}
                    <UnstyledButton
                        onClick={open}
                        disabled={logs.length === 0}
                        style={{ opacity: logs.length > 0 ? 1 : 0.3 }}
                    >
                        <Group gap={4}>
                            <IconTerminal2 size={14} color="var(--mantine-color-blue-filled)" />
                            <Text size="xs" fw={600} c="blue" style={{ textDecoration: 'underline' }}>
                                View Logs
                            </Text>
                        </Group>
                    </UnstyledButton>
                </Group>
            </Box>

            {/* Log Terminal Modal */}
            <Modal
                opened={opened}
                onClose={close}
                title={`Execution Logs: ${repoName}`}
                size="xl"
            >
                <LogTerminal logs={logs} />
            </Modal>
        </>
    );
}
