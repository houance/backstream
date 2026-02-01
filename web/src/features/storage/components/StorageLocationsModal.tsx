import {useState} from 'react';
import {Modal, Button, TextInput, Select, Group, Stack, PasswordInput, Divider} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import {
    RepoType,
    insertRepositorySchema,
    type InsertRepositorySchema,
    updateRepositorySchema,
    type UpdateRepositorySchema,
    EMPTY_REPOSITORY_SCHEMA,
} from '@backstream/shared'
import {notice} from "../../../util/notification.tsx";

interface ModalProps {
    opened: boolean;
    onClose: () => void;
    // data is null for "Create", and populated for "Edit"
    data: UpdateRepositorySchema | null;
    onSubmit: (values: InsertRepositorySchema | UpdateRepositorySchema) => Promise<void> | void;
    title: string;
}

function StorageLocationModal({ opened, onClose, data, onSubmit, title }: ModalProps) {
    const [loading, setLoading] = useState(false);
    // remove provider specify certification
    const { b2, oss, sftp, s3, ...restCertification } = EMPTY_REPOSITORY_SCHEMA.certification;
    const form = useForm<InsertRepositorySchema | UpdateRepositorySchema>({
        initialValues: data ?? {...EMPTY_REPOSITORY_SCHEMA, certification: restCertification},
        validate: zod4Resolver(data ? updateRepositorySchema : insertRepositorySchema),
    });

    // --- ADD IT HERE ---
    console.log('Current Form Errors:', form.errors);
    console.log('Current Form Values:', form.values);

    const handleFormSubmit = async (values: InsertRepositorySchema | UpdateRepositorySchema) => {
        setLoading(true)
        try {
            // Parent handles the 'save' logic
            await onSubmit(values);
            notice(true, data ? `update` : `create` + ` storage location`);
            // Cleanup
            onClose();
            form.reset();
        } catch (e) {
            notice(false, data ? `update` : `create` + " storage location failed");
        } finally {
            setLoading(false)
        }
    };

    const handleTypeChange = (newType: string | null) => {
        if (data) return;
        // 1. Update the top-level repositoryType
        const repoType: RepoType = newType as RepoType;
        form.setFieldValue('repositoryType', repoType);
        // 2. keep RESTIC_PASSWORD and subfield correspond to repoType
        let newCert: any = { RESTIC_PASSWORD: form.values.certification.RESTIC_PASSWORD }
        // 3. Add the specific sub-object from your constants
        switch (repoType) {
            case "AWS_S3":
            case "S3":
                newCert.s3 = EMPTY_REPOSITORY_SCHEMA.certification.s3;
                break;
            case "ALIYUN_OSS":
                newCert.oss = EMPTY_REPOSITORY_SCHEMA.certification.oss;
                break;
            case "BACKBLAZE_B2":
                newCert.b2 = EMPTY_REPOSITORY_SCHEMA.certification.b2;
                break;
            case "SFTP":
                newCert.sftp = EMPTY_REPOSITORY_SCHEMA.certification.sftp;
                break;
            // LOCAL needs no extra fields
        }
        form.setFieldValue('certification', newCert);
    };

    return (
        <Modal opened={opened} onClose={onClose} title={title} centered size="xl">
            <form onSubmit={form.onSubmit((values) => handleFormSubmit(values))}>
                <Stack>
                    <TextInput
                        label="Location Name"
                        placeholder="Location Name"
                        {...form.getInputProps('name')}
                        withAsterisk
                    />
                    <TextInput
                        label="Path"
                        placeholder="/mnt/nas/..."
                        {...form.getInputProps('path')}
                        disabled={!!data}
                        withAsterisk
                    />
                    <PasswordInput
                        variant={!!data ? "filled" : "default"}
                        label="Password"
                        placeholder="Enter restic password"
                        {...form.getInputProps('certification.RESTIC_PASSWORD')} // Use dot notation
                        readOnly={!!data}
                        withAsterisk
                        description="Required to encrypt/decrypt your backups"
                        autoComplete="new-password"
                    />
                    <Select
                        label="Type"
                        data={Object.values(RepoType)}
                        value={form.values.repositoryType}
                        onChange={handleTypeChange}
                        disabled={!!data}
                        withAsterisk
                        required
                    />

                    {form.values.repositoryType !== 'LOCAL' &&
                        <Divider label="Authentication Details" labelPosition="center"/>}

                    {/* Render fields based on the selected Type */}
                    {form.values.repositoryType === "BACKBLAZE_B2" && (
                        <>
                            <TextInput
                                label="B2 ACCOUNT ID"
                                {...form.getInputProps('certification.b2.B2_ACCOUNT_ID')}
                                placeholder="Enter B2 ACCOUNT ID"
                                disabled={!!data}
                                withAsterisk
                            />
                            <PasswordInput
                                variant={!!data ? "filled" : "default"}
                                label="B2 ACCOUNT KEY"
                                placeholder="Enter B2 ACCOUNT KEY"
                                {...form.getInputProps('certification.b2.B2_ACCOUNT_KEY')}
                                readOnly={!!data}
                                withAsterisk
                            />
                        </>
                    )}
                    {(form.values.repositoryType === "AWS_S3" || form.values.repositoryType === "S3") && (
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
                    )}
                    {form.values.repositoryType === "ALIYUN_OSS" && (
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
                    )}
                    {form.values.repositoryType === "SFTP" && (
                        <>
                            <TextInput
                                label="SSH_AUTH_SOCK"
                                {...form.getInputProps('certification.sftp.SSH_AUTH_SOCK')}
                                disabled={!!data}
                            />
                        </>
                    )}

                    <Group justify="flex-end" mt="xl">
                        <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                        <Button type="submit" loading={loading}>{data ? 'Update' : 'Save'} Location</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}

StorageLocationModal.displayName = 'StorageLocationModal';
export default StorageLocationModal;
