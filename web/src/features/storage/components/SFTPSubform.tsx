import type {InsertRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {TextInput} from "@mantine/core";

export function SFTPSubform({form}: { form: UseFormReturnType<InsertRepositorySchema> }) {
    return (
        <TextInput
            label="SSH_AUTH_SOCK"
            {...form.getInputProps('certification.sftp.SSH_AUTH_SOCK')}
        />
    )
}

export default SFTPSubform;