import {Modal, Button, TextInput, Select, Group, Stack, PasswordInput, Divider} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import {
    RepoType,
    insertRepositorySchema,
    type InsertRepositorySchema,
    EMPTY_REPOSITORY_SCHEMA,
} from '@backstream/shared'
import {PROVIDER_MAP} from "../provider-map.tsx";
import MaintainPolicyConfig from "./MaintainPolicyConfig.tsx";

interface ModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (values: InsertRepositorySchema, exist: boolean) => Promise<void> | void;
    onConnect: (values: InsertRepositorySchema, exist: boolean) => Promise<void> | void;
    isSubmitting: boolean;
    isConnecting: boolean;
    title: string;
}

export default function NewStorageLocModal({ opened, onClose, onSubmit, onConnect, title, isSubmitting, isConnecting }: ModalProps) {
    const form = useForm<InsertRepositorySchema>({
        initialValues: EMPTY_REPOSITORY_SCHEMA,
        validate: zod4Resolver(insertRepositorySchema),
    });

    const handleTypeChange = (newType: string | null) => {
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
                    <Select
                        label="Type"
                        data={Object.values(RepoType)}
                        value={form.values.repositoryType}
                        defaultValue={RepoType.LOCAL}
                        onChange={handleTypeChange}
                        withAsterisk
                        allowDeselect={false}
                    />
                    <TextInput
                        label="Location Name"
                        placeholder="Location Name"
                        {...form.getInputProps('name')}
                        withAsterisk
                    />
                    <PasswordInput
                        variant={"default"}
                        label="Password"
                        placeholder="Enter restic password"
                        {...form.getInputProps('password')} // Use dot notation
                        withAsterisk
                        description="Required to encrypt/decrypt your backups"
                        autoComplete="new-password"
                    />
                    <MaintainPolicyConfig form={form} />

                    <Divider label="Authentication Details" labelPosition="center"/>
                    {providerMeta.component !== null && <providerMeta.component form={form} />}

                    <Group justify="flex-end" mt="xl">
                        <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                        <Button variant="outline" loading={isConnecting} onClick={() => onConnect(form.values)}>Test</Button>
                        <Button type="submit" loading={isSubmitting}>{'Save'} Location</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
// for debug purpose
NewStorageLocModal.displayName = 'NewStorageLocModal';
