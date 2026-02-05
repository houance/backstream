import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {TextInput} from "@mantine/core";

export function SFTPSubform({form, data}: { form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>, data: UpdateRepositorySchema | null }) {
    return (
        <>
            {/* 编辑状态认证 certification 可以为空 */}
            {(!data || data.certification !== null) && (
                <TextInput
                    label="SSH_AUTH_SOCK"
                    {...form.getInputProps('certification.sftp.SSH_AUTH_SOCK')}
                    disabled={!!data} // Disable if in edit mode (data exists)
                />
            )}
        </>
    )
}

export default SFTPSubform;