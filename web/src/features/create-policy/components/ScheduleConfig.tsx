import { Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type {InsertBackupPolicySchema} from "@backstream/shared";

// Define presets outside the component to avoid re-renders
const CRON_PRESETS: Record<string, string> = {
    daily: "0 0 0 * * *",
    weekly: "0 0 9 * * 1", // Standard "Every Monday"
};

export function ScheduleConfig({ form, index }: {
    form: UseFormReturnType<InsertBackupPolicySchema>; // Replace any with your actual Schema type
    index: number;
}) {
    const fieldPath = `targets.${index}.schedule.cron`;
    const currentCron = form.values.targets?.[index]?.schedule?.cron;

    // Determine type based on current value
    const scheduleType = Object.keys(CRON_PRESETS).find(
        (key) => CRON_PRESETS[key] === currentCron
    ) || (currentCron ? 'custom' : 'daily');

    const handleTypeChange = (val: string | null) => {
        if (!val) return;

        // Set preset value or clear for custom
        const nextValue = CRON_PRESETS[val] || currentCron || "* * * * *";
        form.setFieldValue(fieldPath, nextValue);
    };

    return (
        <Stack gap="md">
            <Select
                label="Backup Frequency"
                value={scheduleType}
                onChange={handleTypeChange}
                data={[
                    { value: 'daily', label: 'Every Day at Midnight' },
                    { value: 'weekly', label: 'Every Monday' },
                    { value: 'custom', label: 'Custom Cron Expression' },
                ]}
                error={form.errors[fieldPath]}
            />

            {scheduleType === 'custom' ? (
                <TextInput
                    label="Cron Expression"
                    placeholder="* * * * * *"
                    description="Standard 6-column cron syntax"
                    {...form.getInputProps(fieldPath)}
                    withAsterisk
                />
            ) : (
                <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)" radius="sm">
                    <Text size="xs" c="dimmed">
                        Active Schedule: <code style={{ fontWeight: 700 }}>{currentCron}</code>
                    </Text>
                </Paper>
            )}
        </Stack>
    );
}
