import React from "react";
import {Box, Group, Stack, Text} from "@mantine/core";

interface SettingRowProps {
    label: string;
    description: string;
    children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => {
    return (
        <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={0}>
                <Text size="md" fw={500}>{label}</Text>
                <Text size="sm" c="dimmed">{description}</Text>
            </Stack>
            <Box style={{ flexShrink: 0 }}>
                {children}
            </Box>
        </Group>
    );
};

export default SettingRow;