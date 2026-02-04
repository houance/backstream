import {Text, Button, Group, Paper, Stack } from "@mantine/core";
import {IconPlayerPlay, IconShieldCheck, IconTerminal2, IconTrash} from "@tabler/icons-react";

export default function PolicyActionCenter() {
    return (
        <Stack pt="md">
            <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm">Manual Operations</Text>
                <Group>
                    <Button color="blue" leftSection={<IconPlayerPlay size={16} />}>Backup Now</Button>
                    <Button variant="outline" color="teal" leftSection={<IconShieldCheck size={16} />}>Check Integrity</Button>
                    <Button variant="outline" color="orange" leftSection={<IconTrash size={16} />}>Prune Repo</Button>
                </Group>
            </Paper>

            <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm" c="dimmed">Advanced</Text>
                <Button variant="subtle" color="gray" leftSection={<IconTerminal2 size={16} />}>Run Custom Restic Command</Button>
            </Paper>
        </Stack>
    );
}
