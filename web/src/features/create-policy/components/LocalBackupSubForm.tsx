import {Fieldset, TextInput} from "@mantine/core";
import type {InsertBackupPolicySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";

export function LocalBackupSubForm ({ form }: { form: UseFormReturnType<InsertBackupPolicySchema> }) {
    console.log("LocalBackupSubForm", form);

    return (
        <Fieldset legend="Local Target (On-site)">
            <TextInput
                key={form.key('targets.0.index')}
                label="Local Repo ID"
                {...form.getInputProps('targets.0.repositoryId')} />
            {/* Add retention and schedule inputs here */}
        </Fieldset>
    )
}

export default LocalBackupSubForm;