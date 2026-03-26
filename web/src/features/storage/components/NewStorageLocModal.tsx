import {Modal, Button, TextInput, Select, Group, Stack, PasswordInput, Divider, SegmentedControl, Text} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import {
    RepoType,
    insertRepositorySchema,
    type InsertRepositorySchema,
    EMPTY_REPOSITORY_SCHEMA, type UpdateRepositorySchema,
} from '@backstream/shared'
import {PROVIDER_MAP} from "../provider-map.tsx";
import MaintainPolicyConfig from "./MaintainPolicyConfig.tsx";
import { useState } from "react";

interface ModalProps {
    repoList: UpdateRepositorySchema[];
    opened: boolean;
    onClose: () => void;
    onSubmit: (param: {item: InsertRepositorySchema, fromRepoId?: number}) => Promise<void> | void;
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
    // State to track if we are creating or connecting
    const [mode, setMode] = useState<'create' | 'connect'>('create');
    // value to track selected repo id
    const [fromRepoId, setFromRepoId] = useState<string | null>(null);

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
            <Stack gap="md">
                {/* [NEW] Mode Switcher */}
                <Stack gap={4}>
                    <Text size="sm" fw={500}>Mode</Text>
                    <SegmentedControl
                        fullWidth
                        value={mode}
                        onChange={(value) => setMode(value as 'create' | 'connect')}
                        data={[
                            { label: 'Create New', value: 'create' },
                            { label: 'Connect Existing', value: 'connect' },
                        ]}
                    />
                </Stack>

                <form onSubmit={form.onSubmit((values) =>
                    onSubmit({ item: values, fromRepoId: fromRepoId !== null ? Number(fromRepoId) : undefined }))}
                >
                    <Stack>
                        {/* [NEW] Conditional Select for "Create" mode */}
                        {mode === 'create' && (
                            <Select
                                label="Initialize From"
                                placeholder="Select an existing repo to clone config"
                                data={repoList.map(repo => ({
                                    label: repo.name,
                                    value: String(repo.id)
                                }))}
                                value={fromRepoId}
                                onChange={setFromRepoId}
                                clearable
                                description="Select a repository to copy settings and encryption from"
                            />
                        )}

                        <Select
                            label="Provider Type"
                            data={Object.values(RepoType)}
                            value={form.values.repositoryType}
                            onChange={handleTypeChange}
                            withAsterisk
                            allowDeselect={false}
                        />

                        <TextInput
                            label="Location Name"
                            placeholder="e.g. My Offsite Backup"
                            {...form.getInputProps('name')}
                            withAsterisk
                        />

                        <PasswordInput
                            label="Password"
                            placeholder="Enter restic password"
                            {...form.getInputProps('password')}
                            withAsterisk
                            description="Required to encrypt/decrypt your backups"
                            autoComplete="new-password"
                        />

                        <MaintainPolicyConfig form={form} />

                        <Divider label="Authentication Details" labelPosition="center" />
                        {providerMeta.component !== null && <providerMeta.component form={form} />}

                        <Group justify="flex-end" mt="xl">
                            <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                            <Button
                                variant="outline"
                                loading={isConnecting}
                                onClick={() => onConnect({ item: form.values, exist: mode === 'connect' })}
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
