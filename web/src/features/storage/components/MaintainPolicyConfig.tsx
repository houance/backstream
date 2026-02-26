import type {InsertRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {NumberInput, Paper, Select, Stack, Text, TextInput} from "@mantine/core";
import {useState} from "react";

export function MaintainPolicyConfig({ form }: { form: UseFormReturnType<InsertRepositorySchema> }) {
    const presetCronExpression:{value: string, label: string}[] = [
        { value: 'manual', label: 'Manual' },
        { value: '0 0 0 * * *', label: 'Every Day at Midnight' },
        { value: '0 0 9 * * 1-5', label: 'Every Monday' },
        { value: 'custom', label: 'Custom Cron Expression' },
    ]
    const [checkScheduleType, setCheckScheduleType] = useState('manual')
    const [pruneScheduleType, setPruneScheduleType] = useState('manual')

    return (
        <Stack gap="md">
            <Select
                label="Check Frequency"
                value={checkScheduleType}
                data={presetCronExpression}
                onChange={(val) => {
                    setCheckScheduleType(val!);
                    if (val !== 'custom') {
                        form.setFieldValue('checkSchedule', val!)
                    }
                }}
                disabled={!!form.values.checkSchedule}
            />
            {checkScheduleType === 'custom' && (
                <TextInput
                    label="Cron Expression"
                    placeholder="* * * * * *"
                    {...form.getInputProps('checkSchedule')}
                    withAsterisk
                />
            )}
            {checkScheduleType !== 'custom' && checkScheduleType !== 'manual' && (
                <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                    <Text size="xs" c="dimmed">Resulting Cron: <b>{form.values.checkSchedule}</b></Text>
                </Paper>
            )}
            {checkScheduleType !== 'manual' && (
                <NumberInput
                label="Check Percentage"
                description="Portion of the repository to check, 0 for metadata only"
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                fixedDecimalScale
                {...form.getInputProps('checkPercentage')}
                />
            )}

            <Select
                label="Prune Frequency"
                value={pruneScheduleType}
                data={presetCronExpression}
                onChange={(val) => {
                    setPruneScheduleType(val!);
                    if (val !== 'custom') {
                        form.setFieldValue('pruneSchedule', val!)
                    }
                }}
                disabled={!!form.values.pruneSchedule}
            />
            {pruneScheduleType === 'custom' && (
                <TextInput
                    label="Cron Expression"
                    placeholder="* * * * * *"
                    {...form.getInputProps('pruneSchedule')}
                    withAsterisk
                />
            )}
            {pruneScheduleType !== 'custom' && pruneScheduleType !== 'manual' && (
                <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                    <Text size="xs" c="dimmed">Resulting Cron: <b>{form.values.pruneSchedule}</b></Text>
                </Paper>
            )}
        </Stack>
    )
}

export default MaintainPolicyConfig;