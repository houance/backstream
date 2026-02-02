import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {TextInput} from "@mantine/core";

export function SFTPSubform({form, data}: { form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>, data: UpdateRepositorySchema | null }) {
    return (
        <>
            <TextInput
                label="SSH_AUTH_SOCK"
                {...form.getInputProps('certification.sftp.SSH_AUTH_SOCK')}
                disabled={!!data}
            />
        </>
    )
}

export default SFTPSubform;