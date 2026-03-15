import { Accordion, Group, Stack, Text, Badge, Box, Code, Loader, Center } from '@mantine/core';
import {IconBug, IconTerminal} from '@tabler/icons-react';
import type {FailHistory} from "@backstream/shared";
import {LogTerminal} from "../../../component/LogTerminal.tsx";

interface FailHistoryRowProps {
    item: FailHistory; // Type according to your Zod schema
    logs: string[] | undefined;
    isLoadingLogs: boolean;
    onOpen: (id: number) => void;
}

export function FailHistoryRow({ item, logs, isLoadingLogs, onOpen }: FailHistoryRowProps) {
    const statusColor = 'red';

    return (
        <Accordion.Item
            value={item.uuid}
            style={{
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
                py={6}
                onClick={() => onOpen(item.executionId)}
                style={{ '&:hover': { backgroundColor: 'var(--mantine-color-gray-0)' } }}
            >
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        <Center w={20}>
                            <IconBug size={16} color="var(--mantine-color-red-6)" />
                        </Center>

                        <Text fw={700} ff="monospace" size="sm" c="var(--mantine-color-text)">
                            {item.executionId}
                        </Text>

                        <Badge variant="light" color="red" size="xs" radius="sm" tt="uppercase">
                            {item.failReason}
                        </Badge>
                    </Group>

                    <Group gap={4} wrap="nowrap">
                        <Text size="xs" c="dimmed" fw={600}>FAILED:</Text>
                        <Text size="xs" fw={500} c="var(--mantine-color-text)">
                            {new Date(item.scheduledAt).toLocaleString()}
                        </Text>
                    </Group>
                </Group>
            </Accordion.Control>

            <Accordion.Panel>
                <Box mt="xs" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                    <Stack gap="md">
                        <Box>
                            <Group gap="xs" mb={4}>
                                <IconTerminal size={14} />
                                <Text size="xs" fw={700} c="dimmed">FULL COMMAND</Text>
                            </Group>
                            <Code block color="dark.6" c='white' p="sm" style={{
                                fontSize: '11px',
                                borderRadius: '4px',
                            }}>
                                {item.fullCommand}
                            </Code>
                        </Box>

                        <Box>
                            <Text size="xs" fw={700} c="dimmed" mb={4}>LOG OUTPUT</Text>
                            {isLoadingLogs ? (
                                <Center py="xl"><Loader size="sm" variant="dots" /></Center>
                            ) : (
                                <LogTerminal logs={logs} />
                            )}
                        </Box>
                    </Stack>
                </Box>
            </Accordion.Panel>
        </Accordion.Item>
    );
}