import type {InsertRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function S3SubForm({form}: { form: UseFormReturnType<InsertRepositorySchema> }) {
    return (
        <>
            <TextInput
                label="Path"
                placeholder="/mnt/nas/..."
                {...form.getInputProps('path')}
                withAsterisk
            />
            <TextInput
                label="ACCESS KEY ID"
                {...form.getInputProps('certification.s3.AWS_ACCESS_KEY_ID')}
                withAsterisk
            />
            <PasswordInput
                variant={"default"}
                label="SECRET ACCESS KEY"
                type="password"
                {...form.getInputProps('certification.s3.AWS_SECRET_ACCESS_KEY')}
                withAsterisk
            />
            <TextInput
                label="DEFAULT REGION"
                {...form.getInputProps('certification.s3.AWS_DEFAULT_REGION')}
            />
            <TextInput
                label="ENDPOINT"
                {...form.getInputProps('certification.s3.AWS_ENDPOINT')}
            />
            <TextInput
                label="PROFILE"
                {...form.getInputProps('certification.s3.AWS_PROFILE')}
            />
        </>
    )
}

export default S3SubForm;