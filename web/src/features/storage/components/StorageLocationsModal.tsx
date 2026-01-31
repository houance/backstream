import { forwardRef, useImperativeHandle } from 'react';
import { useDisclosure } from '@mantine/hooks';
import {Modal, Button, TextInput, Select, Group, Stack, PasswordInput, Divider} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { RepoType, insertOrUpdateRepository, type RepositorySchema, type InsertOrUpdateRepository } from '@backstream/shared'

export interface ModalRef {
    open: () => void;
    close: () => void;
    setData: (data: RepositorySchema) => void; // Useful for Editing
    reset: () => void;
}

interface ModalProps {
    // Parent handles the actual logic (API calls, state updates)
    onSubmit: (values: InsertOrUpdateRepository) => Promise<void> | void;
    title: string;
}

const StorageLocationModal = forwardRef<ModalRef, ModalProps>(
    ({ onSubmit, title }, ref) => {
        const [opened, { open, close }] = useDisclosure(false);

        const form = useForm<InsertOrUpdateRepository>({
            initialValues: {
                name: '',
                path: '',
                repositoryType: "LOCAL",
                repositoryStatus: 'Active',
                usage: 0,
                capacity: 1,
                certification: {
                    RESTIC_PASSWORD: '',
                    b2: {
                        B2_ACCOUNT_ID: "",
                        B2_ACCOUNT_KEY: ""
                    },
                    oss: {
                        OSS_ACCESS_KEY_ID: "",
                        OSS_SECRET_ACCESS_KEY: "",
                        OSS_ENDPOINT: ""
                    },
                    sftp: {
                        SSH_AUTH_SOCK: ""
                    },
                    s3: {
                        AWS_ACCESS_KEY_ID: "",
                        AWS_SECRET_ACCESS_KEY: "",
                        AWS_DEFAULT_REGION: "",
                        AWS_ENDPOINT: "",
                        AWS_PROFILE: ""
                    }
                }
            },
            validate: zod4Resolver(insertOrUpdateRepository),
        });

        useImperativeHandle(ref, () => ({
            open,
            close,
            setData: (data) => form.setValues(data),
            reset: () => form.reset(),
        }));

        const handleFormSubmit = async (values: InsertOrUpdateRepository) => {
            // Parent handles the 'save' logic
            await onSubmit(values);
            // Cleanup
            close();
            form.reset();
        };

        const handleTypeChange = (newType: string | null) => {
            const type = newType as RepoType || 'LOCAL';

            // 1. Update the top-level repositoryType
            form.setFieldValue('repositoryType', type);

            // 2. Initialize the nested object for the active provider
            // This prevents the "Cannot set properties of undefined" error
            form.setFieldValue('certification', {
                // Preserve the password during the switch
                RESTIC_PASSWORD: form.values.certification.RESTIC_PASSWORD,
                b2: {
                    B2_ACCOUNT_ID: "",
                    B2_ACCOUNT_KEY: ""
                },
                oss: {
                    OSS_ACCESS_KEY_ID: "",
                    OSS_SECRET_ACCESS_KEY: "",
                    OSS_ENDPOINT: ""
                },
                sftp: {
                    SSH_AUTH_SOCK: ""
                },
                s3: {
                    AWS_ACCESS_KEY_ID: "",
                    AWS_SECRET_ACCESS_KEY: "",
                    AWS_DEFAULT_REGION: "",
                    AWS_ENDPOINT: "",
                    AWS_PROFILE: ""
                }
            });
        };


        // Determine if editing
        const isEditing = form.values.id !== undefined;

        return (
            <Modal opened={opened} onClose={close} title={title} centered size="lg">
                <form onSubmit={form.onSubmit(handleFormSubmit)}>
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
                            disabled={isEditing}
                            withAsterisk
                        />
                        <PasswordInput
                            variant={isEditing ? "filled" : "default"}
                            label="Password"
                            placeholder="Enter restic password"
                            {...form.getInputProps('certification.RESTIC_PASSWORD')} // Use dot notation
                            readOnly={isEditing}
                            withAsterisk
                            description="Required to encrypt/decrypt your backups"
                            autoComplete="new-password"
                        />
                        <Select
                            label="Type"
                            data={Object.values(RepoType)}
                            value={form.values.repositoryType}
                            onChange={handleTypeChange}
                            disabled={isEditing}
                            withAsterisk
                            required
                        />

                        {form.values.repositoryType !== 'LOCAL' && <Divider label="Authentication Details" labelPosition="center" />}

                        {/* Render fields based on the selected Type */}
                        {form.values.repositoryType === "BACKBLAZE_B2" && (
                            <>
                                <TextInput
                                    label="B2 ACCOUNT ID"
                                    {...form.getInputProps('certification.b2.B2_ACCOUNT_ID')}
                                    disabled={isEditing}
                                    withAsterisk
                                />
                                <PasswordInput
                                    variant={isEditing ? "filled" : "default"}
                                    label="B2 ACCOUNT KEY"
                                    placeholder="Enter B2 account key"
                                    {...form.getInputProps('certification.b2.B2_ACCOUNT_KEY')}
                                    readOnly={isEditing}
                                    withAsterisk
                                />
                            </>
                        )}
                        {(form.values.repositoryType === "AWS_S3" || form.values.repositoryType === "S3") && (
                            <>
                                <TextInput
                                    label="ACCESS KEY ID"
                                    {...form.getInputProps('certification.s3.AWS_ACCESS_KEY_ID')}
                                    disabled={isEditing}
                                    withAsterisk
                                />
                                <PasswordInput
                                    variant={isEditing ? "filled" : "default"}
                                    label="SECRET ACCESS KEY"
                                    type="password"
                                    {...form.getInputProps('certification.s3.AWS_SECRET_ACCESS_KEY')}
                                    readOnly={isEditing}
                                    withAsterisk
                                />
                                <TextInput
                                    label="DEFAULT REGION"
                                    {...form.getInputProps('certification.s3.AWS_DEFAULT_REGION')}
                                    disabled={isEditing}
                                />
                                <TextInput
                                    label="ENDPOINT"
                                    {...form.getInputProps('certification.s3.AWS_ENDPOINT')}
                                    disabled={isEditing}
                                />
                                <TextInput
                                    label="PROFILE"
                                    {...form.getInputProps('certification.s3.AWS_PROFILE')}
                                    disabled={isEditing}
                                />
                            </>
                        )}
                        {form.values.repositoryType === "ALIYUN_OSS" && (
                            <>
                                <TextInput
                                    label="ACCESS KEY ID"
                                    {...form.getInputProps('certification.oss.OSS_ACCESS_KEY_ID')}
                                    disabled={isEditing}
                                    withAsterisk
                                />
                                <PasswordInput
                                    variant={isEditing ? "filled" : "default"}
                                    label="SECRET ACCESS KEY"
                                    type="password"
                                    {...form.getInputProps('certification.oss.OSS_SECRET_ACCESS_KEY')}
                                    readOnly={isEditing}
                                    withAsterisk
                                />
                                <TextInput
                                    label="ENDPOINT"
                                    {...form.getInputProps('certification.oss.OSS_ENDPOINT')}
                                    disabled={isEditing}
                                />
                            </>
                        )}
                        {form.values.repositoryType === "SFTP" && (
                            <>
                                <TextInput
                                    label="SSH_AUTH_SOCK"
                                    {...form.getInputProps('certification.sftp.SSH_AUTH_SOCK')}
                                    disabled={isEditing}
                                />
                            </>
                        )}

                        <Group justify="flex-end" mt="xl">
                            <Button variant="subtle" color="gray" onClick={close}>Cancel</Button>
                            <Button type="submit" onClick={() => handleFormSubmit(form.values)}>Save Location</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        );
    }
);

StorageLocationModal.displayName = 'StorageLocationModal';
export default StorageLocationModal;
