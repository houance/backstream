import {Fieldset, TextInput} from "@mantine/core";
import type {InsertBackupPolicySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";

export function Strategy321SubForm ({ form }: { form: UseFormReturnType<InsertBackupPolicySchema> }) {
    return (
        <Fieldset legend="Local Target (On-site)">
            <TextInput
                key={form.key('targets.0.index')}
                label="Local Repo ID"
                {...form.getInputProps('targets.0.repositoryId')} />
            <TextInput
                key={form.key('targets.1.index')}
                label="Remote Repo ID"
                {...form.getInputProps('targets.1.repositoryId')} />
            {/* Add retention and schedule inputs here */}
        </Fieldset>
    )
}

export default Strategy321SubForm;