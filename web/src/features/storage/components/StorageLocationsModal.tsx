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
import {PROVIDER_MAP} from "../provider-map.tsx";
import MaintainPolicyConfig from "./MaintainPolicyConfig.tsx";

interface ModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (values: InsertRepositorySchema | UpdateRepositorySchema) => Promise<void> | void;
    onConnect: (values: InsertRepositorySchema | UpdateRepositorySchema) => Promise<void> | void;
    // data is null for "Create", and populated for "Edit"
    data: UpdateRepositorySchema | null;
    isSubmitting: boolean;
    isConnecting: boolean;
    title: string;
}

function StorageLocationModal({ opened, onClose, data, onSubmit, onConnect, title, isSubmitting, isConnecting }: ModalProps) {
    const form = useForm<InsertRepositorySchema | UpdateRepositorySchema>({
        initialValues: data ?? EMPTY_REPOSITORY_SCHEMA,
        validate: zod4Resolver(data ? updateRepositorySchema : insertRepositorySchema),
    });

    const handleTypeChange = (newType: string | null) => {
        if (data) return;
        // 1. Update the top-level repositoryType
        const repoType: RepoType = newType === null ? RepoType.LOCAL : newType as RepoType;
        form.setFieldValue('repositoryType', repoType);
        const newConfig = PROVIDER_MAP[repoType];
        form.setFieldValue('certification', newConfig.initSubForm);
    };

    // Dynamically select the component based on repo type
    const providerMeta = PROVIDER_MAP[form.values.repositoryType];

    return (
        <Modal opened={opened} onClose={onClose} title={title} centered size="xl">
            <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
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
                        variant={data ? "filled" : "default"}
                        label="Password"
                        placeholder="Enter restic password"
                        {...form.getInputProps('password')} // Use dot notation
                        readOnly={!!data}
                        withAsterisk
                        description="Required to encrypt/decrypt your backups"
                        autoComplete="new-password"
                    />
                    <MaintainPolicyConfig form={form} />
                    <Select
                        label="Type"
                        data={Object.values(RepoType)}
                        value={form.values.repositoryType}
                        defaultValue={RepoType.LOCAL}
                        onChange={handleTypeChange}
                        disabled={!!data}
                        withAsterisk
                        allowDeselect={false}
                    />

                    {form.values.repositoryType !== 'LOCAL' &&
                        <Divider label="Authentication Details" labelPosition="center"/>}
                    {providerMeta.component !== null && <providerMeta.component form={form} data={data} />}

                    <Group justify="flex-end" mt="xl">
                        <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                        <Button variant="outline" loading={isConnecting} onClick={() => onConnect(form.values)}>Test</Button>
                        <Button type="submit" loading={isSubmitting}>{data ? 'Update' : 'Save'} Location</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}

StorageLocationModal.displayName = 'StorageLocationModal';
export default StorageLocationModal;
