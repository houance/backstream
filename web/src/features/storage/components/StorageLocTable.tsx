import {Table, Badge, ActionIcon, Group, Card, Box, Text, Progress, Tooltip} from '@mantine/core';
import {IconAlertTriangle, IconEye, IconTrash} from '@tabler/icons-react';
import {formatPath, formatRepoStatus, getRepositoryStats} from "../../../util/format.ts";
import { type UpdateRepositorySchema } from '@backstream/shared'


export default function StorageLocTable(
    {data, onDetail, onDelete} :
    {
        data: UpdateRepositorySchema[],
        onDetail: (repoId: number) => void,
        onDelete: (item: UpdateRepositorySchema) => void,
    }) {

    const rows = data.map((item) => {
        const { usedStr, totalStr, percentage } = getRepositoryStats(item.size, item.capacity);
        const status = formatRepoStatus(item);

        return (
            <Table.Tr
                key={item.id}
            >
                <Table.Td><b>{item.name}</b></Table.Td>
                <Table.Td>
                    <Tooltip label={status.label} position='top-start' withArrow openDelay={300}>
                        <Badge variant="dot" color={status.color} size="sm">{item.repositoryType}</Badge>
                    </Tooltip>
                </Table.Td>
                <Table.Td>
                    <Tooltip label={item.path} position='top-start' withArrow openDelay={300}>
                        <Text
                            size='sm'
                            style={{
                                cursor: 'help',
                                wordBreak: 'break-all', // Allows breaking at any character if needed
                                maxWidth: '600px',      // Caps the growth
                            }}
                        >
                            {formatPath(item.path, 60)}
                        </Text>
                    </Tooltip>
                </Table.Td>
                <Table.Td>
                    <Box maw={180}>
                        <Group justify="space-between" mb={4}>
                            <Text size="xs">
                                {usedStr} / {totalStr}
                            </Text>
                            {percentage > 90 && (
                                <Tooltip label="Low space on this repository">
                                    <IconAlertTriangle size={14} color="red" />
                                </Tooltip>
                            )}
                        </Group>
                        <Progress.Root size="lg" radius="xl">
                            <Progress.Section
                                value={percentage}
                                color={percentage > 90 ? 'red' : percentage > 70 ? 'orange' : 'blue'}
                                striped={percentage > 80}
                            >
                                <Progress.Label>
                                    {percentage.toFixed(1)}%
                                </Progress.Label>
                            </Progress.Section>
                        </Progress.Root>
                    </Box>
                </Table.Td>
                <Table.Td>
                    <Group gap={4} justify='left'>
                        <Tooltip label="Detail" withArrow openDelay={300}>
                            <ActionIcon
                                variant="light"
                                aria-label="Detail"
                                onClick={() => onDetail(item.id)}
                            >
                                <IconEye size="1rem" />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" color='red' withArrow openDelay={300}>
                            <ActionIcon
                                variant="light"
                                color="red"
                                aria-label="Delete"
                                onClick={(e) => {
                                    // Prevent row navigation when clicking delete
                                    e.stopPropagation();
                                    onDelete(item);
                                }}
                            >
                                <IconTrash size="1rem" />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Table.Td>
            </Table.Tr>
        )});

    return (
        <Card shadow="sm" p="lg" radius="md" withBorder mb="xl">
            <Table highlightOnHover verticalSpacing="md" horizontalSpacing='lg'>
                <Table.Thead >
                    <Table.Tr fz="sm" tt='uppercase'>
                        <Table.Th style={{ width: '15%'}} >Location</Table.Th>
                        <Table.Th style={{ width: '15%'}} >Status & Type</Table.Th>
                        <Table.Th style={{ width: '25%'}} >Path</Table.Th>
                        <Table.Th style={{ width: '20%'}} >Capacity</Table.Th>
                        <Table.Th style={{ width: '100px' }}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
            </Table>
        </Card>
    );
}
