import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function B2SubForm({form, data}: { form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>, data: UpdateRepositorySchema | null }) {
    return (
        <>
            <TextInput
                label="B2 ACCOUNT ID"
                {...form.getInputProps('certification.b2.B2_ACCOUNT_ID')}
                placeholder="Enter B2 ACCOUNT ID"
                disabled={!!data}
                withAsterisk
            />
            <PasswordInput
                variant={!!data ? "filled" : "default"}
                label="B2 ACCOUNT KEY"
                placeholder="Enter B2 ACCOUNT KEY"
                {...form.getInputProps('certification.b2.B2_ACCOUNT_KEY')}
                readOnly={!!data}
                withAsterisk
            />
        </>
    )
}

export default B2SubForm;