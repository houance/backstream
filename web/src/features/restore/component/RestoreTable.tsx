import { Table, Badge, Group, ActionIcon, Collapse } from '@mantine/core';
import { IconDownload, IconFileText, IconTrash, IconLoader2 } from '@tabler/icons-react';
import type {UpdateRestoreSchema} from "@backstream/shared";
import React from 'react';
import {LogTerminal} from "../../../component/LogTerminal.tsx";

interface RestoreTableProps {
    data: UpdateRestoreSchema[];
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

    return (
        <Table verticalSpacing="sm">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Scheduled</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {data.map((item) => (
                    <React.Fragment key={item.id}>
                        <Table.Tr>
                            <Table.Td>{item.resultName || `Restore #${item.id}`}</Table.Td>
                            <Table.Td>
                                <Badge color={getStatusColor(item.restoreStatus)} variant="light">
                                    {item.restoreStatus}
                                </Badge>
                            </Table.Td>
                            <Table.Td>{new Date(item.scheduledAt).toLocaleString()}</Table.Td>
                            <Table.Td>
                                <Group gap="xs">
                                    <ActionIcon
                                        variant="light"
                                        disabled={item.restoreStatus !== 'success'}
                                        onClick={() => onDownload(item.id)}
                                    >
                                        <IconDownload size={18} />
                                    </ActionIcon>

                                    <ActionIcon
                                        variant={activeLogId === item.id ? 'filled' : 'light'}
                                        onClick={() => onToggleLog(item.id)}
                                    >
                                        {item.restoreStatus === 'running' ? <IconLoader2 className="animate-spin" size={18} /> : <IconFileText size={18} />}
                                    </ActionIcon>

                                    <ActionIcon variant="light" color="red" onClick={() => onDelete(item.id)}>
                                        <IconTrash size={18} />
                                    </ActionIcon>
                                </Group>
                            </Table.Td>
                        </Table.Tr>

                        {/* Log Row */}
                        <Table.Tr>
                            <Table.Td colSpan={4} style={{ padding: 0, borderBottom: activeLogId === item.id ? undefined : 0 }}>
                                <Collapse in={activeLogId === item.id}>
                                    <LogTerminal logs={logs} />
                                </Collapse>
                            </Table.Td>
                        </Table.Tr>
                    </React.Fragment>
                ))}
            </Table.Tbody>
        </Table>
    );
}
