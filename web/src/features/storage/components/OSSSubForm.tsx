import type {InsertRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function OSSSubform({form}: { form: UseFormReturnType<InsertRepositorySchema> }) {
    return (
        <>
            <TextInput
                label="ACCESS KEY ID"
                {...form.getInputProps('certification.oss.OSS_ACCESS_KEY_ID')}
                withAsterisk
            />
            <PasswordInput
                variant={"default"}
                label="SECRET ACCESS KEY"
                type="password"
                {...form.getInputProps('certification.oss.OSS_SECRET_ACCESS_KEY')}
                withAsterisk
            />
            <TextInput
                label="ENDPOINT"
                {...form.getInputProps('certification.oss.OSS_ENDPOINT')}
            />
        </>
    )
}

export default OSSSubform;