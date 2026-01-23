'use client'; // If using Next.js App Router

import { forwardRef, useImperativeHandle, useCallback } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { Modal, Button, TextInput, Select, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';

// Define the shape of the data submitted
interface LocationData {
    locationName: string;
    path: string;
    type: 'NAS' | 'Cloud' | 'Tape' | 'Local' | null;
    capacity: string;
}

// Define the methods we want to expose to the parent component
export interface AddLocationModalRef {
    open: () => void;
    close: () => void;
    // Optional: A method to manually trigger form submission from the parent
    // submitForm: () => Promise<void>;
}

interface AddLocationModalProps {
    // Callback function to inform the parent about success/failure
    onSubmissionComplete: (success: boolean, data?: LocationData) => void;
}

const storageTypes = [
    { value: 'NAS', label: 'NAS' },
    { value: 'Cloud', label: 'Cloud' },
    { value: 'Tape', label: 'Tape' },
    { value: 'Local', label: 'Local' },
];

const AddLocationModal = forwardRef<AddLocationModalRef, AddLocationModalProps>(
    ({ onSubmissionComplete }, ref) => {
        const [opened, { open, close }] = useDisclosure(false);

        // Expose open/close methods to the parent via ref
        useImperativeHandle(ref, () => ({
            open,
            close,
        }));

        const form = useForm<LocationData>({
            mode: 'controlled',
            initialValues: {
                locationName: '',
                path: '',
                type: null,
                capacity: '',
            },
            validate: {
                locationName: (value) => (value.length < 2 ? 'Name must have at least 2 letters' : null),
                path: (value) => (value.length === 0 ? 'Path cannot be empty' : null),
                type: (value) => (value === null ? 'Please select a type' : null),
            },
        });

        const handleSubmit = useCallback(async (values: LocationData) => {
            // Simulate backend call (hojojs integration would go here)
            try {
                console.log('Submitting data to backend:', values);
                // await api.post('/locations', values);

                onSubmissionComplete(true, values); // Notify parent of success
                close(); // Close modal on success
                form.reset(); // Reset form for next use

            } catch (error) {
                console.error("Submission failed:", error);
                onSubmissionComplete(false); // Notify parent of failure
                // Optionally keep modal open or show an error notification inside the modal
            }
        }, [close, form, onSubmissionComplete]);

        return (
            <Modal opened={opened} onClose={close} title="Add New Storage Location" centered size="xl">
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack>
                        <TextInput label="Location Name" placeholder="e.g., Primary NAS Storage" {...form.getInputProps('locationName')} withAsterisk />
                        <TextInput label="Path" placeholder="e.g., /mnt/nas/backup01" {...form.getInputProps('path')} withAsterisk />
                        <Select label="Type" placeholder="Pick a type" data={storageTypes} {...form.getInputProps('type')} withAsterisk />
                        <TextInput label="Capacity" placeholder="e.g., 5 TB" {...form.getInputProps('capacity')} />

                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={close}>Cancel</Button>
                            <Button type="submit">Save Location</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        );
    }
);

AddLocationModal.displayName = 'AddLocationModal';
export default AddLocationModal;
