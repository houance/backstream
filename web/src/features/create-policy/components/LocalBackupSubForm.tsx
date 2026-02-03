import {Card, Text, Paper, Select, Stack, TextInput, Title, Grid, TagsInput} from "@mantine/core";
import {WindowType, type InsertBackupPolicySchema, type RetentionType, type UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {useState} from "react";

export function LocalBackupSubForm ({ form, repoList }: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    repoList: UpdateRepositorySchema[]
}) {
    const [scheduleType, setScheduleType] = useState('daily');
    const policy = form.values.targets[0].retentionPolicy

    const handleRetentionPolicyChange = (val: string | null) => {
        const type = val as RetentionType
        if (type === "tag") {
            form.setFieldValue("targets.0.retentionPolicy", {
                type: type,
                tagValue: []
            })
        } else if (type === "count") {
            form.setFieldValue("targets.0.retentionPolicy", {
                type: type,
                windowType: WindowType.last,
                countValue: "100"
            })
        } else {
            form.setFieldValue("targets.0.retentionPolicy", {
                type: type,
                windowType: WindowType.yearly,
                durationValue: "1y"
            })
        }
    }

    return (
        <Card withBorder radius="md" p="lg">
            <Title order={5} mb="md">Local Repository Configuration</Title>
            <Stack gap="md">
                {/* Repository Selection */}
                <Select
                    label="Backup Repository"
                    placeholder="Select a repository"
                    data={repoList.map(repo => ({
                        label: repo.name,
                        value: String(repo.id)
                    }))}
                    searchable
                    nothingFoundMessage="No repositories found"
                    value={form.values.targets[0].repositoryId?.toString() || null}
                    onChange={(val) => form.setFieldValue("targets.0.repositoryId", Number(val))}
                />
                {/* --- Cron Schedule --- */}
                <Card withBorder radius="md" p="lg">
                    <Title order={6} mb="md">Schedule Rule</Title>
                    <Stack gap="md">
                        <Select
                            label="Backup Frequency"
                            value={scheduleType}
                            onChange={(val) => {
                                setScheduleType(val!);
                                if (val === 'daily') form.setFieldValue('targets.0.schedulePolicy', '0 0 * * *');
                                if (val === 'weekly') form.setFieldValue('targets.0.schedulePolicy', '0 0 * * 0');
                            }}
                            data={[
                                { value: 'daily', label: 'Every Day at Midnight' },
                                { value: 'weekly', label: 'Every Sunday' },
                                { value: 'custom', label: 'Custom Cron Expression' },
                            ]}
                        />

                        {scheduleType === 'custom' && (
                            <TextInput
                                label="Cron Expression"
                                placeholder="* * * * *"
                                description="Format: minute hour day-of-month month day-of-week"
                                {...form.getInputProps('targets.0.schedulePolicy')}
                            />
                        )}

                        {scheduleType !== 'custom' && (
                            <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                                <Text size="xs" c="dimmed">Resulting Cron: <b>{form.values.targets[0].schedulePolicy}</b></Text>
                            </Paper>
                        )}
                    </Stack>
                </Card>
                {/* Retention Config */}
                <Card withBorder radius="md" p="lg">
                    <Title order={6} mb="md">Retention Rule</Title>
                    <Grid align="flex-end">
                        {/* 1. Rule Type Selection */}
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Select
                                label="Rule Type"
                                data={[
                                    { value: 'count', label: 'By Count (Keep X)' },
                                    { value: 'duration', label: 'By Duration (Within X)' },
                                    { value: 'tag', label: 'By Tags' },
                                ]}
                                value={form.values.targets[0].retentionPolicy.type}
                                onChange={handleRetentionPolicyChange}
                            />
                        </Grid.Col>

                        {/* 2. Dynamic Window Selection (Hidden for Tags) */}
                        {policy.type !== 'tag' && (
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Select
                                    label="Time Window"
                                    data={Object.values(WindowType).map((item) => ({
                                        label: item,
                                        value: item
                                    }))}
                                    {...form.getInputProps('targets.0.retentionPolicy.windowType')}
                                />
                            </Grid.Col>
                        )}

                        {/* 3. Value Input - Changes based on Type */}
                        <Grid.Col span={{ base: 12, md: policy.type === 'tag' ? 8 : 4 }}>
                            {policy.type === 'count' && (
                                <TextInput
                                    label="How many to keep?"
                                    placeholder="7 or unlimited"
                                    {...form.getInputProps('targets.0.retentionPolicy.countValue')}
                                />
                            )}

                            {policy.type === 'duration' && (
                                <TextInput
                                    label="Duration"
                                    placeholder="e.g. 2y5m"
                                    description="Use: y, m, d, h"
                                    {...form.getInputProps('targets.0.retentionPolicy.durationValue')}
                                />
                            )}

                            {policy.type === 'tag' && (
                                <TagsInput
                                    label="Tags to Keep"
                                    placeholder="Type tag and press Enter"
                                    description="Select existing tags or create new ones"
                                    // Suggestions for the user to pick from
                                    data={['production', 'staging', 'critical']}
                                    // Allows comma or Enter to create the tag
                                    splitChars={[',', ' ']}
                                    // Binding to your Zod array
                                    {...form.getInputProps('targets.0.retentionPolicy.tagValue')}
                                />
                            )}
                        </Grid.Col>
                    </Grid>
                </Card>
            </Stack>
        </Card>
    )
}

export default LocalBackupSubForm;