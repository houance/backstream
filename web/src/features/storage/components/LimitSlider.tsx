import { useState, useEffect } from 'react';
import { Slider, SegmentedControl, Switch, Group, Stack, Text, NumberInput, Box } from '@mantine/core';
import type {UseFormReturnType} from '@mantine/form';
import type {StorageCreateSchema} from "@backstream/shared";

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export default function LimitSlider({ form }: { form: UseFormReturnType<StorageCreateSchema>; }) {
    const [unit, setUnit] = useState<'GB' | 'TB'>('GB');
    const rawValue = form.values.meta.storageLimit;
    const isEnabled = rawValue !== -1 && rawValue !== null;

    // Local state for smooth UI interaction
    const [localValue, setLocalValue] = useState<number>(1);

    // Sync state on external changes
    useEffect(() => {
        if (isEnabled) {
            setLocalValue(parseFloat((rawValue / (unit === 'TB' ? TB : GB)).toFixed(2)));
        }
    }, [rawValue, unit, isEnabled]);

    const commitValue = (val: number | string) => {
        const numVal = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(numVal)) return;
        setLocalValue(numVal);
        form.setFieldValue('meta.storageLimit', Math.round(unit === 'TB' ? numVal * TB : numVal * GB));
    };

    return (
        <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xs" style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>Storage Limit</Text>
                    <Switch
                        checked={isEnabled}
                        onChange={(e) => form.setFieldValue('meta.storageLimit', e.currentTarget.checked ? GB : -1)}
                        size="sm"
                    />
                </Group>

                {/* Fixed NumberInput for stability + Unit Selector */}
                <Group gap="xs">
                    {isEnabled && (
                        <NumberInput
                            size="xs"
                            value={localValue}
                            onChange={commitValue}
                            decimalScale={2}
                            suffix={` ${unit}`}
                            w={90}
                            hideControls // Cleaner look, use slider for increments
                            styles={{ input: { textAlign: 'right', fontWeight: 600 } }}
                        />
                    )}
                    <SegmentedControl
                        disabled={!isEnabled}
                        value={unit}
                        onChange={(val: any) => setUnit(val)}
                        data={['GB', 'TB']}
                        size="xs"
                    />
                </Group>
            </Group>

            <Box px={5} pb="md">
                <Slider
                    disabled={!isEnabled}
                    value={localValue}
                    onChange={setLocalValue}
                    onChangeEnd={commitValue}
                    min={0.1}
                    max={unit === 'TB' ? 100 : 1024}
                    step={unit === 'TB' ? 0.1 : 1}
                    label={null}
                    // Sophisticated marks: 0, 25%, 50%, 75%, 100%
                    marks={[
                        { value: unit === 'TB' ? 1 : 1, label: unit === 'TB' ? '1T' : '1G' },
                        { value: unit === 'TB' ? 50 : 512, label: '50%' },
                        { value: unit === 'TB' ? 100 : 1024, label: unit === 'TB' ? '100T' : '1T' },
                    ]}
                />
            </Box>
        </Stack>
    );
}
