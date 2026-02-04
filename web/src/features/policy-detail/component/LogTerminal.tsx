import {Text, Box, Group} from "@mantine/core";
import {IconTerminal2} from "@tabler/icons-react";

/**
 * Log Terminal Component
 * Mimics a CLI output for restic progress
 */
export function LogTerminal({logs}: { logs: string[] | undefined }) {
    return (
        <Box
            p="md"
            bg="dark.8"
            style={{borderRadius: '4px', border: '1px solid var(--mantine-color-dark-4)'}}
        >
            <Group mb="xs" gap="xs">
                <IconTerminal2 size={14} color="var(--mantine-color-gray-5)"/>
                <Text size="xs" c="gray.5" ff="monospace" fw={700}>restic stdout</Text>
            </Group>
            {logs && logs.map((log, i) => (
                <Text key={i} size="xs" ff="monospace" c="gray.3" style={{lineHeight: 1.5}}>
                    <span style={{color: 'var(--mantine-color-blue-4)'}}>{'>'}</span> {log}
                </Text>
            ))}
        </Box>
    );
}