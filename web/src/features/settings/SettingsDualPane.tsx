import {
    Text, Card, Grid, Stack, TextInput,
    NumberInput, Button, Group, Box, SegmentedControl,
    Title
} from '@mantine/core';
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useForm } from '@mantine/form';
import {updateSystemSettingSchema, type UpdateSystemSettingSchema} from '@backstream/shared';

interface SystemSettingsProps {
    initialData: UpdateSystemSettingSchema;
    onSubmit: (values: UpdateSystemSettingSchema) => Promise<void> | void;
    isSubmitting: boolean;
}

export function SettingsDualPane({ initialData, onSubmit, isSubmitting }: SystemSettingsProps) {
    const form = useForm<UpdateSystemSettingSchema>({
        initialValues: initialData,
        // 3. Link Zod to Mantine Form
        validate: zod4Resolver(updateSystemSettingSchema),
    });

    return (
        <form onSubmit={form.onSubmit((values) => {
            onSubmit(values);
            form.resetDirty();
        })}>
            <Stack gap="xl">
                <Grid gutter="xl">
                    {/* Left Column: Alerts & Maintenance */}
                    <Grid.Col span={{base: 12, lg: 6}}>
                        <Stack gap="md">
                            <Card withBorder radius="md" p="lg">
                                <Title order={5} mb="md">Health & Alerts</Title>
                                <Stack gap="sm">
                                    <TextInput
                                        label="Admin Email"
                                        placeholder="admin@example.com"
                                        {...form.getInputProps('email')}
                                    />
                                </Stack>
                            </Card>

                            <Card withBorder radius="md" p="lg">
                                <Title order={5} mb="md">Log Retention & Updates</Title>
                                <Stack gap="sm">
                                    <NumberInput
                                        label="Retention Period (Days)"
                                        min={1}
                                        {...form.getInputProps('logRetentionDays')}
                                    />
                                </Stack>
                            </Card>
                        </Stack>
                    </Grid.Col>

                    {/* Right Column: Performance */}
                    <Grid.Col span={{base: 12, lg: 6}}>
                        <Card withBorder radius="md" p="lg" h="100%">
                            <Title order={5} mb="md">Performance & Resources</Title>
                            <Stack gap="lg">
                                <Box>
                                    <Text size="sm" fw={500} mb={5}>I/O Priority</Text>
                                    <SegmentedControl
                                        fullWidth
                                        data={[{label: 'Low', value: 'low'}, {label: 'Normal', value: 'normal'}]}
                                        {...form.getInputProps('ioPriority')}
                                    />
                                </Box>
                            </Stack>
                        </Card>
                    </Grid.Col>
                </Grid>

                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        // Button is disabled if nothing changed OR if currently saving
                        disabled={!form.isDirty() || isSubmitting}
                    >
                        Save All Settings
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

export default SettingsDualPane;