import {Button, Center, Container, Group, Loader} from '@mantine/core';
import {IconPlus} from '@tabler/icons-react';
import { notice } from "../../util/notification.tsx";
import NewStorageLocModal from './components/NewStorageLocModal.tsx';
import StorageLocTable from "./components/StorageLocTable.tsx";
import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import {useDisclosure} from "@mantine/hooks";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {client} from "../../api";
import {ensureSuccess} from "../../util/api.ts";
import {useNavigate} from "react-router-dom";

export default function StorageLocPage() {
    // 1. Manage state for opening/closing and the data to edit
    const [opened, {open, close}] = useDisclosure(false);
    const navigate = useNavigate();

    // --- 2. FETCH DATA ---
    const queryClient = useQueryClient();
    const {data, isPending: isLoading} = useQuery({
        queryKey: ['storage-locations'],
        queryFn: async () => {
            const res = await client.api.storage['all-storage-location'].$get();
            if (!res.ok) throw new Error('Failed to fetch storage locations');
            return res.json();
        },
        refetchInterval: 5000,
    });

    // --- 3. CREATE/UPDATE MUTATION ---
    const submitMutation = useMutation({
        mutationFn: async ({ item, exist, fromRepoId }: {item: InsertRepositorySchema | UpdateRepositorySchema, exist: boolean, fromRepoId?: number}) => {
            if ('id' in item && item.id) {
                return ensureSuccess(
                    client.api.storage[':id'].$patch({
                        param: {id: item.id.toString()},
                        json: item
                    })
                )
            }
            return ensureSuccess(
                client.api.storage.$post({json: {repo: item, exist: exist, fromRepoId: fromRepoId}})
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ['storage-locations']});
            notice(true, "Storage location saved successfully");
            close();
        },
        onError: (error) => notice(false, `${String(error)}.`)
    });

    // --- 4. DELETE MUTATION ---
    const deleteMutation = useMutation({
        mutationFn: async (item: UpdateRepositorySchema) => {
            return ensureSuccess(client.api.storage[':id'].$delete({param: {id: item.id.toString()}}))
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ['storage-locations']});
            notice(true, "Item deleted");
        },
        onError: (error) => notice(false, `${String(error)}.`)
    });
    // --- TEST CONNECTION MUTATION ---
    const testConnMutation = useMutation({
        mutationFn: async ({ item, exist }: { item: InsertRepositorySchema | UpdateRepositorySchema, exist: boolean }) => {
            const response = await client.api.storage['test-connection'].$post(
                {
                    json: {repo: item, exist: exist }
                });
            const result = await response.json()
            if (!response.ok) throw new Error(!result.success ? result.error : 'Connection failed');
            return result;
        },
        onSuccess: () => {
            // You can trigger a Mantine notification here
            notice(true, `connection success`)
        },
        onError: (error) => {
            notice(false, `connection failed: ${error}`)
        }
    });

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
            <StorageLocTable
                data={data!}
                onDetail={(repoId: number) => navigate(`/storage/detail/${repoId}`)}
                onDelete={deleteMutation.mutate}
            />
            {/* Add Storage Location Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{borderTop: '1px solid var(--mantine-color-gray-3)'}}>
                <Button leftSection={<IconPlus size="1rem"/>} variant="filled" onClick={open}>
                    Add Location
                </Button>
            </Group>
            {/* The modal component instance */}
            <NewStorageLocModal
                key={opened ? 'open' : 'closed'} // Forcing a remount
                repoList={data!}
                onSubmit={submitMutation.mutate}
                isSubmitting={submitMutation.isPending}
                onConnect={testConnMutation.mutate}
                isConnecting={testConnMutation.isPending}
                isConnectSuccess={testConnMutation.isSuccess}
                title={"Create storage location"}
                opened={opened}
                onClose={close}
            />
        </Container>
    );
}

