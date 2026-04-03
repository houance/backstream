import type {StorageCreateSchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function OSSSubform({form}: { form: UseFormReturnType<StorageCreateSchema> }) {
    return (
        <>
            <TextInput
                label="Path"
                placeholder="/mnt/nas/..."
                {...form.getInputProps('meta.path')}
                withAsterisk
            />
            <TextInput
                label="ACCESS KEY ID"
                {...form.getInputProps('meta.certification.oss.OSS_ACCESS_KEY_ID')}
                withAsterisk
            />
            <PasswordInput
                variant={"default"}
                label="SECRET ACCESS KEY"
                type="password"
                {...form.getInputProps('meta.certification.oss.OSS_SECRET_ACCESS_KEY')}
                withAsterisk
            />
            <TextInput
                label="ENDPOINT"
                {...form.getInputProps('meta.certification.oss.OSS_ENDPOINT')}
            />
        </>
    )
}

export default OSSSubform;