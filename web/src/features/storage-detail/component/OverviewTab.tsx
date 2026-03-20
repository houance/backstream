import { Grid, Stack, Text, Table, Badge, Button, Paper } from '@mantine/core';
import { IconCheck, IconTrash } from '@tabler/icons-react';

export function OverviewTab() {
    return (
        <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}>
                <Paper withBorder p="md" radius="md">
                    <Table variant="vertical" withTableBorder layout="fixed">
                        <Table.Tbody>
                            <Table.Tr><Table.Th w={160}>Backend Type</Table.Th><Table.Td>S3 Compatible (Minio)</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Endpoint</Table.Th><Table.Td>https://s3.example.com</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Format</Table.Th><Table.Td>v2 (Compression Enabled)</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Full Hash</Table.Th><Table.Td><Text size="xs" ff="monospace">7b2a9f4...28394</Text></Table.Td></Table.Tr>
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
                <Stack>
                    <Paper withBorder p="md" radius="md">
                        <Text fw={700} size="xs" c="dimmed" mb="xs" tt="uppercase">Maintenance Actions</Text>
                        <Stack gap="sm">
                            <Button fullWidth variant="light" leftSection={<IconCheck size={16}/>}>Check Integrity</Button>
                            <Button fullWidth color="red" variant="light" leftSection={<IconTrash size={16}/>}>Prune Repository</Button>
                        </Stack>
                    </Paper>
                    <Paper withBorder p="md" radius="md">
                        <Text fw={700} size="xs" c="dimmed" mb="xs" tt="uppercase">Status</Text>
                        <Badge color="green" variant="dot" size="lg">Connected</Badge>
                    </Paper>
                </Stack>
            </Grid.Col>
        </Grid>
    );
}
