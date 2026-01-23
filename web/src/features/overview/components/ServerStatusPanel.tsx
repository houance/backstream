import React from 'react';
import { Card, Title, Text } from '@mantine/core';

interface ServerStatusPanelProps {
    title: string;
    type: string;
    lastBackup: string;
    nextRun: string;
}

const ServerStatusPanel: React.FC<ServerStatusPanelProps> = ({ title, type, lastBackup, nextRun }) => {
    return (
        <Card shadow="sm" p="lg" radius="md" withBorder style={{ height: '100%' }}>
            <Title order={4}>{title}</Title>
            <Text size="sm" c="dimmed" mt="sm">Type: {type}</Text>
            <Text size="sm" c="dimmed">Last Backup: {lastBackup} ago</Text>
            <Text size="sm" c="dimmed">Next Run: {nextRun}</Text>
        </Card>
    );
};

export default ServerStatusPanel;
