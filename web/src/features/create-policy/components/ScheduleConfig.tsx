import type {UseFormReturnType} from "@mantine/form";
import type {InsertBackupPolicySchema} from "@backstream/shared";
import {Paper, Select, Stack, Text, TextInput} from "@mantine/core";
import {useState} from "react";

export function ScheduleConfig({form, index}: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    index: number;
}) {
    const [scheduleType, setScheduleType] = useState('daily');
    const fieldPath = `targets.${index}.schedulePolicy`;

    return (
        <Stack gap="md">
            <Select
                label="Backup Frequency"
                value={scheduleType}
                onChange={(val) => {
                    setScheduleType(val!);
                    if (val === 'daily') form.setFieldValue(fieldPath, '0 0 0 * * *');
                    if (val === 'weekly') form.setFieldValue(fieldPath, '0 0 9 * * 1-5');
                }}
                data={[
                    { value: 'daily', label: 'Every Day at Midnight' },
                    { value: 'weekly', label: 'Every Monday' },
                    { value: 'custom', label: 'Custom Cron Expression' },
                ]}
            />

            {scheduleType === 'custom' && (
                <TextInput
                    label="Cron Expression"
                    placeholder="* * * * * *"
                    {...form.getInputProps(fieldPath)}
                    withAsterisk
                />
            )}

            {scheduleType !== 'custom' && (
                <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                    <Text size="xs" c="dimmed">Resulting Cron: <b>{form.values.targets[index].schedulePolicy}</b></Text>
                </Paper>
            )}
        </Stack>
    )
}