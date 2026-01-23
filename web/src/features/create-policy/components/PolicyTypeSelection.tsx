import { Radio, Group, Stack, Text, SimpleGrid, Box } from '@mantine/core';
import { BACKUP_POLICIES } from '../config.tsx';

export default function PolicyTypeSelection({ value, onChange }: {
    value: string | null;
    onChange: (val: string) => void
}) {
    return (
        <Radio.Group value={value} onChange={onChange} label="Select Strategy">
            <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md">
                {Object.entries(BACKUP_POLICIES).map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = value === key;

                    return (
                        <Radio.Card
                            key={key}
                            value={key}
                            p="md"
                            style={{
                                border: `1px solid ${isSelected ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-default-border)'}`,
                                backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : 'transparent',
                            }}
                        >
                            <Group wrap="nowrap" align="flex-start">
                                <Radio.Indicator />
                                <Stack gap={2}>
                                    <Text fw={500}>{config.label}</Text>
                                    <Text size="xs" c="dimmed">{config.description}</Text>
                                </Stack>
                                <Box ml="auto" c="blue"><Icon size={30} /></Box>
                            </Group>
                        </Radio.Card>
                    );
                })}
            </SimpleGrid>
        </Radio.Group>
    );
}
