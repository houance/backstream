import type {UseFormReturnType} from "@mantine/form";
import {
    type InsertBackupPolicySchema,
    type RetentionType,
    RetentionType as RetentionVal,
    WindowType
} from "@backstream/shared";
import {Grid, Select, TagsInput, TextInput} from "@mantine/core";

export function RetentionPolicyConfig({form, tagList, index}: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    tagList: string[],
    index: number;
}) {
    const policy = form.values.targets[index].retentionPolicy
    const fieldPath = `targets.${index}.retentionPolicy`;

    const handleRetentionPolicyChange = (val: string | null) => {
        const type = val as RetentionType
        if (type === "tag") {
            form.setFieldValue(fieldPath, {
                type: type,
                tagValue: []
            })
        } else if (type === "count") {
            form.setFieldValue(fieldPath, {
                type: type,
                windowType: WindowType.last,
                countValue: ""
            })
        } else {
            form.setFieldValue(fieldPath, {
                type: type,
                windowType: WindowType.yearly,
                durationValue: ""
            })
        }
    }

    return (
        <Grid align="flex-end">
            <Grid.Col span={{ base: 12, md: 4 }}>
                <Select
                    label="Retention Policy Type"
                    data={Object.values(RetentionVal).map((item) => ({
                        label: item,
                        value: item
                    }))}
                    value={form.values.targets[index].retentionPolicy.type}
                    onChange={handleRetentionPolicyChange}
                />
            </Grid.Col>

            {/* 2. Dynamic Window Selection (Hidden for Tags) */}
            {policy.type !== RetentionVal.tag && (
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Select
                        label="Time Window"
                        data={Object.values(WindowType).map((item) => ({
                            label: item,
                            value: item
                        }))}
                        {...form.getInputProps(fieldPath + '.windowType')}
                    />
                </Grid.Col>
            )}

            {/* 3. Value Input - Changes based on Type */}
            <Grid.Col span={{ base: 12, md: policy.type === RetentionVal.tag ? 8 : 4 }}>
                {policy.type === 'count' && (
                    <TextInput
                        label="How many to keep?"
                        placeholder="number or unlimited"
                        {...form.getInputProps(fieldPath + '.countValue')}
                        withAsterisk
                    />
                )}

                {policy.type === RetentionVal.duration && (
                    <TextInput
                        label="Duration"
                        placeholder="Use y, m, d, h. e.g. 2y5m"
                        {...form.getInputProps(fieldPath + '.durationValue')}
                        withAsterisk
                    />
                )}

                {policy.type === RetentionVal.tag && (
                    <TagsInput
                        label="Tags to Keep"
                        placeholder="Type tag and press Enter"
                        // Suggestions for the user to pick from
                        data={tagList}
                        // Allows comma or Enter to create the tag
                        splitChars={[',', ' ']}
                        // Binding to your Zod array
                        {...form.getInputProps(fieldPath + '.tagValue')}
                        withAsterisk
                    />
                )}
            </Grid.Col>
        </Grid>
    )
}