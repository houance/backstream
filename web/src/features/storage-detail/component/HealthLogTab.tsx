import { Table, Badge, ThemeIcon, Text, Paper } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

export function HealthLogTab() {
    const logs = [
        { type: 'Check', status: 'success', time: '2024-03-18 09:00', msg: 'No errors found.' },
        { type: 'Prune', status: 'success', time: '2024-03-17 22:00', msg: 'Reclaimed 12.4 GB.' },
        { type: 'Check', status: 'error', time: '2024-03-16 09:00', msg: 'Integrity check failed on blob 4a1...' },
    ];

    return (
        <Paper withBorder radius="md">
            <Table verticalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Task</Table.Th>
                        <Table.Th>Result</Table.Th>
                        <Table.Th>Timestamp</Table.Th>
                        <Table.Th>Message</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {logs.map((log, i) => (
                        <Table.Tr key={i}>
                            <Table.Td><Badge variant="outline">{log.type}</Badge></Table.Td>
                            <Table.Td>
                                <ThemeIcon color={log.status === 'success' ? 'green' : 'red'} size="sm" radius="xl">
                                    {log.status === 'success' ? <IconCheck size={12}/> : <IconX size={12}/>}
                                </ThemeIcon>
                            </Table.Td>
                            <Table.Td><Text size="sm">{log.time}</Text></Table.Td>
                            <Table.Td><Text size="xs">{log.msg}</Text></Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
}
