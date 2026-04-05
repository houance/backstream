import type { StorageCreateSchema } from "@backstream/shared";
import type { UseFormReturnType } from "@mantine/form";
import { NumberInput, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";

const PRESETS = [
    { value: 'manual', label: 'Manual' },
    { value: '0 0 0 * * *', label: 'Every Day at Midnight' },
    { value: '0 0 9 * * 1-5', label: 'Every Monday' },
    { value: 'custom', label: 'Custom Cron Expression' },
];

interface ScheduleFieldProps {
    label: string;
    path: 'checkSchedule.cron' | 'pruneSchedule.cron';
    form: UseFormReturnType<StorageCreateSchema>;
}

function ScheduleField({ label, path, form }: ScheduleFieldProps) {
    const [type, setType] = useState('manual');
    const isCustom = type === 'custom';
    const isManual = type === 'manual';

    return (
        <>
            <Select
                label={label}
                value={type}
                data={PRESETS}
                onChange={(val) => {
                    setType(val!);
                    if (val !== 'custom') form.setFieldValue(path, val!);
                }}
                error={form.errors[path]}
            />

            {isCustom && (
                <TextInput
                    label="Cron Expression"
                    placeholder="* * * * * *"
                    {...form.getInputProps(path)}
                    withAsterisk
                />
            )}

            {!isCustom && !isManual && (
                <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                    <Text size="xs" c="dimmed">
                        Resulting Cron: <b>{form.values[path.split('.')[0] as 'checkSchedule' | 'pruneSchedule'].cron}</b>
                    </Text>
                </Paper>
            )}
        </>
    );
}

export default function MaintainPolicyConfig({ form }: { form: UseFormReturnType<StorageCreateSchema> }) {
    // Determine if Check is active to show the extra NumberInput
    const isCheckActive = form.values.checkSchedule.cron !== 'manual';

    return (
        <Stack gap="md">
            <ScheduleField label="Check Frequency" path="checkSchedule.cron" form={form} />

            {isCheckActive && (
                <NumberInput
                    label="Check Percentage"
                    description="Portion of the repository to check, 0 for metadata only"
                    min={0} max={1} step={0.01} decimalScale={2} fixedDecimalScale
                    {...form.getInputProps('checkSchedule.extraConfig.checkPercentage')}
                />
            )}

            <ScheduleField label="Prune Frequency" path="pruneSchedule.cron" form={form} />
        </Stack>
    );
}
