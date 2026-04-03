import type {StorageCreateSchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function B2SubForm({form}: { form: UseFormReturnType<StorageCreateSchema> }) {
    return (
        <>
            <TextInput
                label="Path"
                placeholder="/mnt/nas/..."
                {...form.getInputProps('meta.path')}
                withAsterisk
            />
            <TextInput
                label="B2 ACCOUNT ID"
                {...form.getInputProps('meta.certification.b2.B2_ACCOUNT_ID')}
                placeholder="Enter B2 ACCOUNT ID"
                withAsterisk
            />
            <PasswordInput
                variant={"default"}
                label="B2 ACCOUNT KEY"
                placeholder="Enter B2 ACCOUNT KEY"
                {...form.getInputProps('meta.certification.b2.B2_ACCOUNT_KEY')}
                withAsterisk
            />
        </>
    )
}

export default B2SubForm;