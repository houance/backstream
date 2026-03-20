import {Table, Badge, ActionIcon, Group, Card, Box, Text, Progress, Tooltip} from '@mantine/core';
import {IconAlertTriangle, IconTrash} from '@tabler/icons-react';
import {getRepositoryStats} from "../../../util/format.ts";
import { type UpdateRepositorySchema } from '@backstream/shared'

export default function StorageLocTable(
    {data, onDetail, onDelete} :
    {
        data: UpdateRepositorySchema[],
        onDetail: (repoId: number) => void,
        onDelete: (item: UpdateRepositorySchema) => void,
    }) {

    const rows = data.map((item) => {
        const { usedStr, totalStr, percentage } = getRepositoryStats(item.usage, item.capacity);

        return (
            <Table.Tr
                key={item.id}
                // Add pointer cursor and click handler
                style={{ cursor: 'pointer' }}
                onClick={() => onDetail(item.id)}
            >
                <Table.Td><b>{item.name}</b></Table.Td>
                <Table.Td>{item.path}</Table.Td>
                <Table.Td>{item.repositoryType}</Table.Td>
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
                    <Badge color={item.repositoryStatus === 'Active' ? 'green' : 'yellow'} variant="light">
                        {item.repositoryStatus}
                    </Badge>
                </Table.Td>
                <Table.Td>
                    <Tooltip label="Delete Storage Location" color='red' withArrow openDelay={300}>
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
                </Table.Td>
            </Table.Tr>
        )});

    return (
        <Card shadow="sm" p="lg" radius="md" withBorder mb="xl">
            <Table striped highlightOnHover verticalSpacing="md" layout="fixed">
                <Table.Thead>
                    <Table.Tr fz="lg">
                        <Table.Th>Location Name</Table.Th>
                        <Table.Th>Path</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Capacity</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th style={{ width: '120px' }}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
            </Table>
        </Card>
    );
}
