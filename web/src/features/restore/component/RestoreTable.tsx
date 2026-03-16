import { Table, Badge, Group, ActionIcon, Collapse, Card, Text, Box, Tooltip } from '@mantine/core';
import { IconDownload, IconFileText, IconTrash, IconLoader2 } from '@tabler/icons-react';
import { type RestoreDataSchema } from "@backstream/shared";
import React from 'react';
import { LogTerminal } from "../../../component/LogTerminal.tsx";
import {formatBytes, formatTimestamp} from "../../../util/format.ts";

interface RestoreTableProps {
    data: RestoreDataSchema[];
    activeLogId: number | null;
    logs: string[] | undefined;
    onToggleLog: (id: number) => void;
    onDownload: (id: number) => void;
    onDelete: (id: number) => void;
}

export default function RestoreTable({ data, activeLogId, logs, onToggleLog, onDownload, onDelete }: RestoreTableProps) {
    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            success: 'green', fail: 'red', running: 'blue', pending: 'gray', cancel: 'orange'
        };
        return colors[status] || 'gray';
    };

    const rows = data.sort((a, b) => b.createdAt - a.createdAt).map((item, index) => {
        const status = item.executions?.[0]?.executeStatus || 'pending';
        const isActive = activeLogId === item.id;
        const rowBg = index % 2 !== 0 ? 'var(--mantine-color-gray-0)' : 'transparent';

        return (
            <React.Fragment key={item.id}>
                {/* Main Data Row */}
                <Table.Tr bg={rowBg}>
                    <Table.Td>
                        <Text size="sm" c="dimmed" fw={500}>{item.id}</Text>
                    </Table.Td>
                    <Table.Td>
                        <Text fw={700} size="sm">
                            {item.resultName || 'Unnamed Restore'}
                        </Text>
                    </Table.Td>
                    <Table.Td>
                        <Box maw={300}>
                            <Group gap={6} wrap="nowrap">
                                <Text fw={700} size="sm" truncate="end">
                                    {item.files[0]?.name || 'Unknown'}
                                </Text>
                                {item.files.length > 1 && (
                                    <Badge size="xs" variant="outline" color="gray">
                                        +{item.files.length - 1} more
                                    </Badge>
                                )}
                            </Group>
                            <Text size="xs" c="dimmed" truncate="end">
                                {item.files[0]?.path || '/'}
                            </Text>
                        </Box>
                    </Table.Td>
                    <Table.Td>
                        {formatBytes(item.resultSize)}
                    </Table.Td>
                    <Table.Td>
                        {formatTimestamp(item.createdAt)}
                    </Table.Td>
                    <Table.Td>
                        <Badge color={getStatusColor(status)} variant="light">
                            {status}
                        </Badge>
                    </Table.Td>
                    <Table.Td>
                        <Group gap="xs" justify="flex-start">
                            {/* Tooltip for Download */}
                            <Tooltip label="Download restore file" withArrow openDelay={300}>
                                <ActionIcon
                                    variant="light"
                                    disabled={status !== 'success'}
                                    onClick={() => onDownload(item.id)}
                                >
                                    <IconDownload size={18} />
                                </ActionIcon>
                            </Tooltip>

                            {/* Tooltip for Logs */}
                            <Tooltip label={isActive ? "Hide terminal" : "View restore logs"} withArrow openDelay={300}>
                                <ActionIcon
                                    variant={isActive ? 'filled' : 'light'}
                                    onClick={() => onToggleLog(item.id)}
                                >
                                    {status === 'running' ?
                                        <IconLoader2 className="animate-spin" size={18} /> :
                                        <IconFileText size={18} />
                                    }
                                </ActionIcon>
                            </Tooltip>

                            {/* Tooltip for Delete */}
                            <Tooltip label="Delete restore entry" color="red" withArrow openDelay={300}>
                                <ActionIcon
                                    variant="light"
                                    color="red"
                                    onClick={() => onDelete(item.id)}
                                >
                                    <IconTrash size={18} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Table.Td>
                </Table.Tr>

                {/* Log Row - colSpan updated to 6 */}
                <Table.Tr bg={rowBg} style={{ borderBottom: isActive ? undefined : 'none' }}>
                    <Table.Td colSpan={7} p={0}>
                        <Collapse in={isActive}>
                            <Box p="md">
                                <LogTerminal logs={logs} />
                            </Box>
                        </Collapse>
                    </Table.Td>
                </Table.Tr>
            </React.Fragment>
        );
    });

    return (
        <Card shadow="sm" p="lg" radius="md" withBorder mb="xl">
            <Table highlightOnHover verticalSpacing="md">
                <Table.Thead>
                    <Table.Tr fz='lg'>
                        <Table.Th style={{ width: '80px' }}>ID</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Source Files</Table.Th>
                        <Table.Th>Size</Table.Th>
                        <Table.Th>Created At</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th style={{ width: '150px' }}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
            </Table>
        </Card>
    );
}
