import type {StorageCreateSchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {TextInput} from "@mantine/core";

export function SFTPSubform({form}: { form: UseFormReturnType<StorageCreateSchema> }) {
    return (
        <>
            <TextInput
                label="Path"
                placeholder="/mnt/nas/..."
                {...form.getInputProps('meta.path')}
                withAsterisk
            />
            <TextInput
                label="SSH_AUTH_SOCK"
                {...form.getInputProps('meta.certification.sftp.SSH_AUTH_SOCK')}
            />
        </>
    )
}

export default SFTPSubform;