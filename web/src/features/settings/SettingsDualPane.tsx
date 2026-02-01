import {
    Text, Card, Grid, Stack, TextInput,
    NumberInput, Switch, Button, Group, Box, SegmentedControl,
    Title
} from '@mantine/core';
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useForm } from '@mantine/form';
import {systemSettings, type SystemSettings} from '@backstream/shared';
import {notice} from "../../util/notification.tsx";
import {useState} from "react";

interface SystemSettingsProps {
    initialData: SystemSettings;
    onSubmit: (values: SystemSettings) => Promise<void> | void;
}

export function SettingsDualPane({ initialData, onSubmit }: SystemSettingsProps) {
    const [loading, setLoading] = useState(false)
    const form = useForm<SystemSettings>({
        initialValues: initialData,
        // 3. Link Zod to Mantine Form
        validate: zod4Resolver(systemSettings),
    });

    const handleSubmit = async (values: SystemSettings) => {
        setLoading(true)
        try {
            await onSubmit(values);
            notice(true, `update system settings`);
        } catch (error) {
            notice(false, "submit system settings failed");
            form.reset()
        } finally {
            setLoading(false)
        }
    };

    return (
        <form onSubmit={form.onSubmit((values) => handleSubmit(values))}>
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
                                        {...form.getInputProps('notificationEmail')}
                                    />
                                    <Switch
                                        label="Only notify on critical failure"
                                        {...form.getInputProps('alertOnFailureOnly', {type: 'checkbox'})}
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
                                <Box>
                                    <NumberInput
                                        label="Minimal Disk Space"
                                        description="pause backup when disk space low"
                                        suffix=" GB"
                                        {...form.getInputProps('minDiskSpaceGB')}
                                    />
                                </Box>
                            </Stack>
                        </Card>
                    </Grid.Col>
                </Grid>

                <Group justify="flex-end">
                    <Button type="submit" loading={loading}>Save All Settings</Button>
                </Group>
            </Stack>
        </form>
    )
}

export default SettingsDualPane;