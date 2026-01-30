import { forwardRef, useImperativeHandle } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { Modal, Button, TextInput, Select, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import {type StorageLocation} from "../type/types.ts";
import { RepoType } from '@backstream/shared'

export interface ModalRef {
    open: () => void;
    close: () => void;
    setData: (data: StorageLocation) => void; // Useful for Editing
    reset: () => void;
}

interface ModalProps {
    // Parent handles the actual logic (API calls, state updates)
    onSubmit: (values: StorageLocation) => Promise<void> | void;
    title: string;
}

const StorageLocationModal = forwardRef<ModalRef, ModalProps>(
    ({ onSubmit, title }, ref) => {
        const [opened, { open, close }] = useDisclosure(false);

        const form = useForm<StorageLocation>({
            initialValues: {
                id: -1,
                name: '',
                path: '',
                type: "LOCAL",
                status: 'Active',
                usage: -1,
                capacity: -1
            },
            validate: {
                name: (v) => (v.length < 2 ? 'Too short' : null),
                path: (v) => (v.length === 0 ? 'Required' : null),
                type: (v) => (v === null ? 'Required' : null),
            },
        });

        useImperativeHandle(ref, () => ({
            open,
            close,
            setData: (data) => form.setValues(data),
            reset: () => form.reset(),
        }));

        const handleFormSubmit = async (values: StorageLocation) => {
            // Parent handles the 'save' logic
            await onSubmit(values);
            // Cleanup
            close();
            form.reset();
        };

        // Determine if editing
        const isEditing = form.values.id !== -1;

        return (
            <Modal opened={opened} onClose={close} title={title} centered size="lg">
                <form onSubmit={form.onSubmit(handleFormSubmit)}>
                    <Stack>
                        <TextInput
                            label="Location Name"
                            placeholder="Local"
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
                        <Select
                            label="Type"
                            data={Object.values(RepoType)}
                            {...form.getInputProps('type')}
                            disabled={isEditing}
                            withAsterisk
                        />

                        <Group justify="flex-end" mt="xl">
                            <Button variant="subtle" color="gray" onClick={close}>Cancel</Button>
                            <Button type="submit">Save Location</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        );
    }
);

StorageLocationModal.displayName = 'StorageLocationModal';
export default StorageLocationModal;
