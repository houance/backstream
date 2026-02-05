import React, {useState} from 'react';
import {Button, Center, Container, Group, Loader} from '@mantine/core';
import {IconPlus} from '@tabler/icons-react';
import { notice } from "../../util/notification.tsx";
import StorageLocationModal from './components/StorageLocationsModal.tsx';
import StorageLocationTable from "./components/StorageLocationTable.tsx";
import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import {useDisclosure} from "@mantine/hooks";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {client} from "../../api";
import {ensureSuccess} from "../../util/api.ts";

const StorageLocationsPage: React.FC = () => {
    // 1. Manage state for opening/closing and the data to edit
    const [opened, {open, close}] = useDisclosure(false);
    const [editingItem, setEditingItem] = useState<UpdateRepositorySchema | null>(null);

    // --- 2. FETCH DATA ---
    const queryClient = useQueryClient();
    const {data, isLoading} = useQuery({
        queryKey: ['storage-locations'],
        queryFn: async () => {
            const res = await client.api.storage['all-storage-location'].$get();
            if (!res.ok) throw new Error('Failed to fetch storage locations');
            return res.json();
        },
    });

    // --- 3. CREATE/UPDATE MUTATION ---
    const submitMutation = useMutation({
        mutationFn: async (item: InsertRepositorySchema | UpdateRepositorySchema) => {
            if ('id' in item && item.id) {
                return ensureSuccess(
                    client.api.storage[':id'].$patch({
                        param: {id: item.id.toString()},
                        json: item
                    })
                )
            }
            return ensureSuccess(
                client.api.storage.$post({json: item})
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ['storage-locations']});
            notice(true, "Storage location saved successfully");
            close();
        },
        onError: () => notice(false, "Failed to save storage location")
    });

    // --- 4. DELETE MUTATION ---
    const deleteMutation = useMutation({
        mutationFn: async (item: UpdateRepositorySchema) => {
            const res = await client.api.storage[':id'].$delete({
                param: {id: item.id.toString()},
            });
            return res.json();
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ['storage-locations']});
            notice(true, "Item deleted");
        }
    });
    // 5. OpenModal as empty
    const openCreateModal = () => {
        setEditingItem(null);
        open();
    }
    // 6. open modal as edit
    const openEditModal = (item: UpdateRepositorySchema) => {
        setEditingItem(item);
        open()
    }
    const handleTestConnection = async (item: InsertRepositorySchema | UpdateRepositorySchema) => {
        notice(true, `connection ${item.name} success`)
    }

    if (isLoading) {
        return (
            <Center h={400}>
                <Loader size="xl"/>
            </Center>
        );
    }

    return (
        <Container fluid p={0}>
            {/* Storage Location 数据展示 */}
            <StorageLocationTable
                data={data!}
                onEdit={(item) => openEditModal(item)}
                onDelete={(item) => deleteMutation.mutate(item)}/>
            {/* Add Storage Location Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{borderTop: '1px solid var(--mantine-color-gray-3)'}}>
                <Button leftSection={<IconPlus size="1rem"/>} variant="filled" onClick={openCreateModal}>
                    Add Location
                </Button>
            </Group>
            {/* The modal component instance */}
            <StorageLocationModal
                key={editingItem?.id ?? 'create-storage-location'}
                onSubmit={(item) => submitMutation.mutate(item)}
                isSubmitting={isLoading}
                onTestConnection={(item) => handleTestConnection(item)}
                title={editingItem ? "Edit storage location" : "Create storage location"}
                opened={opened}
                onClose={close}
                data={editingItem}/>
        </Container>
    );
};

export default StorageLocationsPage;

