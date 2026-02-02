import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {PasswordInput, TextInput} from "@mantine/core";

export function S3SubForm({form, data}: { form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>, data: UpdateRepositorySchema | null }) {
    return (
        <>
            <TextInput
                label="ACCESS KEY ID"
                {...form.getInputProps('certification.s3.AWS_ACCESS_KEY_ID')}
                disabled={!!data}
                withAsterisk
            />
            <PasswordInput
                variant={!!data ? "filled" : "default"}
                label="SECRET ACCESS KEY"
                type="password"
                {...form.getInputProps('certification.s3.AWS_SECRET_ACCESS_KEY')}
                readOnly={!!data}
                withAsterisk
            />
            <TextInput
                label="DEFAULT REGION"
                {...form.getInputProps('certification.s3.AWS_DEFAULT_REGION')}
                disabled={!!data}
            />
            <TextInput
                label="ENDPOINT"
                {...form.getInputProps('certification.s3.AWS_ENDPOINT')}
                disabled={!!data}
            />
            <TextInput
                label="PROFILE"
                {...form.getInputProps('certification.s3.AWS_PROFILE')}
                disabled={!!data}
            />
        </>
    )
}

export default S3SubForm;