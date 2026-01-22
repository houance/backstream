import React from 'react';
import { Table, Badge, ActionIcon, Group } from '@mantine/core';
import { IconSettings, IconTrash } from '@tabler/icons-react';

interface StorageLocationRowProps {
    name: string;
    path: string;
    type: string;
    capacity: string;
    status: 'Active' | 'Warning';
}

const StorageLocationRow: React.FC<StorageLocationRowProps> = ({ name, path, type, capacity, status }) => {
    const statusColor = status === 'Active' ? 'green' : 'yellow';

    return (
        <Table.Tr>
            <Table.Td><b>{name}</b></Table.Td>
            <Table.Td>{path}</Table.Td>
            <Table.Td>{type}</Table.Td>
            <Table.Td>{capacity}</Table.Td>
            <Table.Td>
                <Badge color={statusColor} variant="light">{status}</Badge>
            </Table.Td>
            <Table.Td>
                <Group gap="md">
                    <ActionIcon variant="light" color="gray" aria-label="Settings">
                        <IconSettings size="1rem" />
                    </ActionIcon>
                    <ActionIcon variant="light" color="red" aria-label="Delete">
                        <IconTrash size="1rem" />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    );
};

export default StorageLocationRow;
