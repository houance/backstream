import { useForm } from '@mantine/form';
import { TextInput, Stack, SegmentedControl, Button, Divider, Fieldset } from '@mantine/core';
import { STRATEGY_MAP } from './strategy-map.tsx'
import {
    EMPTY_BACKUP_POLICY_SCHEMA,
    insertBackupPolicySchema,
    type InsertBackupPolicySchema,
    type StrategyType,
} from '@backstream/shared'
import {zod4Resolver} from "mantine-form-zod-resolver";

export function CreatePolicyPage() {
    const form = useForm<InsertBackupPolicySchema>({
        initialValues: EMPTY_BACKUP_POLICY_SCHEMA,
        validate: zod4Resolver(insertBackupPolicySchema)
    });

    const handleStrategyTypeChange = (value: string) => {
        const strategyType = value as StrategyType;
        form.setFieldValue('strategy.strategyType', strategyType);
        const newConfig = STRATEGY_MAP[strategyType];
        form.setFieldValue('targets', newConfig.initSubForm)
    }

    // Dynamically select the component based on strategy
    const strategyMeta = STRATEGY_MAP[form.values.strategy.strategyType];

    return (
        <form onSubmit={form.onSubmit((values) => console.log(values))}>
            <Stack gap="md">
                {/* Common Section: Shared by ALL strategies */}
                <Fieldset legend="Basic Configuration">
                    <TextInput label="Plan Name" {...form.getInputProps('name')} required />
                    <TextInput label="Source Path" placeholder="/data/mysql" {...form.getInputProps('dataSource')} />
                </Fieldset>

                <Divider label="Strategy Selection" labelPosition="center" />

                <SegmentedControl
                    fullWidth
                    data={Object.entries(STRATEGY_MAP).map(([key, meta]) => {
                        return {
                            label: meta.label,
                            value: key,
                        }
                    })}
                    {...form.getInputProps('strategy.strategyType')}
                    onChange={handleStrategyTypeChange}
                />

                {/* Strategy-Specific Section: Swapped dynamically */}
                {strategyMeta.component && <strategyMeta.component form={form} />}

                <Button type="submit" size="md">Create Backup Plan</Button>
            </Stack>
        </form>
    );
}

export default CreatePolicyPage;