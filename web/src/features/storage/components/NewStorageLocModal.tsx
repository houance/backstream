import {Modal, Button, TextInput, Select, Group, Stack, PasswordInput, Divider, SegmentedControl, Text} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import {
    repoType,
    type InsertRepositorySchema,
    type UpdateRepositorySchema,
    type RepoType,
    type StorageCreateSchema, EMPTY_STORAGE_CREATE_SCHEMA, storageCreateSchema,
} from '@backstream/shared'
import {PROVIDER_MAP} from "../provider-map.tsx";
import MaintainPolicyConfig from "./MaintainPolicyConfig.tsx";

interface ModalProps {
    repoList: UpdateRepositorySchema[];
    opened: boolean;
    onClose: () => void;
    onSubmit: (param: {item: StorageCreateSchema}) => Promise<void> | void;
    onConnect: (param: {item: InsertRepositorySchema, exist: boolean}) => Promise<void> | void;
    isSubmitting: boolean;
    isConnecting: boolean;
    isConnectSuccess: boolean;
    title: string;
}

export default function NewStorageLocModal({
                                               repoList,
                                               opened,
                                               onClose,
                                               onSubmit,
                                               onConnect,
                                               title,
                                               isSubmitting,
                                               isConnecting,
                                               isConnectSuccess,
}: ModalProps) {
    const form = useForm<StorageCreateSchema>({
        initialValues: EMPTY_STORAGE_CREATE_SCHEMA,
        validate: zod4Resolver(storageCreateSchema),
    });

    const handleTypeChange = (newType: string | null) => {
        // 1. Update the top-level repositoryType
        const repositoryType: RepoType = newType === null ? repoType.LOCAL : newType as RepoType;
        form.setFieldValue('meta.repositoryType', repositoryType);
        const newConfig = PROVIDER_MAP[repositoryType];
        form.setFieldValue('meta.certification', newConfig.initSubForm);
    };

    // Dynamically select the component based on repo type
    const providerMeta = PROVIDER_MAP[form.values.meta.repositoryType];

    return (
        <Modal opened={opened} onClose={onClose} title={title} centered size="xl">
            <Stack gap="md">
                {/* [NEW] Mode Switcher */}
                <Stack gap={4}>
                    <Text size="sm" fw={500}>Mode</Text>
                    <SegmentedControl
                        fullWidth
                        {...form.getInputProps('mode')}
                        data={[
                            {label: 'Create New', value: 'create'},
                            {label: 'Connect Existing', value: 'connect'},
                        ]}
                    />
                </Stack>

                <form onSubmit={form.onSubmit(
                    (values) => onSubmit({item: values}),
                    (validationErrors) => console.log('Validation failed:', validationErrors)
                )}>
                    <Stack>
                        {/* [NEW] Conditional Select for "Create" mode */}
                        {form.values.mode === 'create' && (
                            <Select
                                label="Initialize From"
                                clearable
                                data={repoList.map(repo => ({
                                    label: repo.name,
                                    value: String(repo.id)
                                }))}
                                // Convert form number to string for the UI
                                value={form.values.fromRepoId ? String(form.values.fromRepoId) : null}
                                onChange={(val) => {
                                    // Simple direct mapping; nullish() handles the null if cleared
                                    form.setFieldValue('fromRepoId', val ? Number(val) : null);
                                }}
                                error={form.errors.fromRepoId}
                            />
                        )}

                        <Select
                            label="Provider Type"
                            data={Object.values(repoType)}
                            value={form.values.meta.repositoryType}
                            onChange={handleTypeChange}
                            withAsterisk
                            allowDeselect={false}
                        />

                        <TextInput
                            label="Location Name"
                            placeholder="e.g. My Offsite Backup"
                            {...form.getInputProps('meta.name')}
                            withAsterisk
                        />

                        <PasswordInput
                            label="Password"
                            placeholder="Enter restic password"
                            {...form.getInputProps('meta.password')}
                            withAsterisk
                            description="Required to encrypt/decrypt your backups"
                            autoComplete="new-password"
                        />

                        <MaintainPolicyConfig form={form}/>

                        <Divider label="Authentication Details" labelPosition="center"/>
                        {providerMeta.component !== null && <providerMeta.component form={form}/>}

                        <Group justify="flex-end" mt="xl">
                            <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                            <Button
                                variant="outline"
                                loading={isConnecting}
                                onClick={() => {
                                    // 1. Run validation manually
                                    const validation = form.validate();
                                    // 2. Only proceed if there are no errors
                                    if (!validation.hasErrors) {
                                        onConnect({
                                            item: form.values.meta,
                                            exist: form.values.mode === 'connect'
                                        });
                                    }
                                }}
                            >
                                Test
                            </Button>
                            <Button type="submit" loading={isSubmitting} disabled={!isConnectSuccess}>
                                Save
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Stack>
        </Modal>
    );
}
// for debug purpose
NewStorageLocModal.displayName = 'NewStorageLocModal';
