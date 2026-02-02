import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function OSSSubform({form, data}: { form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>, data: UpdateRepositorySchema | null }) {
    return (
        <>
            <TextInput
                label="ACCESS KEY ID"
                {...form.getInputProps('certification.oss.OSS_ACCESS_KEY_ID')}
                disabled={!!data}
                withAsterisk
            />
            <PasswordInput
                variant={!!data ? "filled" : "default"}
                label="SECRET ACCESS KEY"
                type="password"
                {...form.getInputProps('certification.oss.OSS_SECRET_ACCESS_KEY')}
                readOnly={!!data}
                withAsterisk
            />
            <TextInput
                label="ENDPOINT"
                {...form.getInputProps('certification.oss.OSS_ENDPOINT')}
                disabled={!!data}
            />
        </>
    )
}

export default OSSSubform;