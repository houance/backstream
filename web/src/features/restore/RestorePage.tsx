import { useState } from 'react';
import {useQuery, useMutation, useQueryClient, keepPreviousData} from '@tanstack/react-query';
import RestoreTable from './component/RestoreTable';
import {ensureSuccess} from "../../util/api.ts";
import { client } from 'src/api/index.ts';
import type {FilterQuery} from "@backstream/shared";
import {notice} from "../../util/notification.tsx";
import { Center, Container, Group, Loader, Pagination, Select, Text} from "@mantine/core";

export default function RestorePage() {
    // filter query state
    const [filter, setFilter] = useState<FilterQuery>({
        page: 0,
        pageSize: 15,
        startTime: 0,
        endTime: 0
    });
    const [activeLogId, setActiveLogId] = useState<number | null>(null);
    const queryClient = useQueryClient();

    // 1. Fetch Table Data
    const { data: allRestores, isPending: isRestoresLoading, isPlaceholderData } = useQuery({
        queryKey: ['restores'],
        queryFn: async () => {
            const res = await client.api.restore['all-restores'].$post({
                json: filter
            });
            if (!res.ok) throw new Error('Failed to fetch all restores');
            return res.json();
        },
        staleTime: 5000, // Background refresh for statuses
        placeholderData: keepPreviousData
    });
    // 2. Fetch Logs (Only enabled if a log is opened)
    const { data: logs } = useQuery({
        queryKey: ['restores', activeLogId, 'logs'],
        queryFn: async () => {
            const res = await client.api.restore['restore-log'][':id'].$get({
                param: { id: activeLogId!.toString() }
            });
            if (!res.ok) throw new Error('Failed to fetch restore logs');
            return res.json();
        },
        enabled: !!allRestores && !!activeLogId,
        staleTime: 5000,
        placeholderData: keepPreviousData
    });
    // --- 3. DOWNLOAD RESTORE FILE ---
    const restoreDownloadMutate = useMutation({
        mutationFn: async (id: number) => {
            // HEAD CHECK if file exist
            const headRes = await client.api.restore['download-restore-file'].$get({
                query: { key: id.toString() },
                init: { method: 'HEAD' } // Trigger HEAD instead of GET
            });
            if (!headRes.ok) {
                console.warn('Restore reported success, but file is missing on server.');
                return { success: false, error: 'file_not_found' };
            }
            // Trigger actual browser download
            const downloadUrl = client.api.restore['download-restore-file'].$url({
                query: { key: id.toString() }
            });
            const a = document.createElement('a');
            a.download = ''; // set to empty use server header
            a.href = downloadUrl.toString();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        onError: (error) => {
            notice(false, 'Sequence failed:' + error.message);
        }
    })
    // --- DELETE RESTORE ---
    const deleteRestore = useMutation(({
        mutationFn: async (id: number) => {
            return ensureSuccess(
                client.api.restore[':id'].$delete({
                    param: { id: id.toString() }
                })
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['restores']});
            notice(true, 'restore delete success');
        },
        onError: (error) => notice(false, `${String(error)}`)
    }))

    const handleToggleLog = (id: number) => {
        setActiveLogId(current => (current === id ? null : id));
    };

    if (isRestoresLoading && !isPlaceholderData) {
        return (
            <Center h={400}>
                <Loader size="xl"/>
            </Center>
        );
    }

    return (
        <Container fluid p={0}>
            <RestoreTable
                data={allRestores?.restores ?? []}
                activeLogId={activeLogId}
                logs={logs}
                onToggleLog={handleToggleLog}
                onDownload={restoreDownloadMutate.mutate}
                onDelete={deleteRestore.mutate}
            />
            <Group justify="flex-end" mt="xl" pt="md" style={{borderTop: '1px solid var(--mantine-color-gray-3)'}}>
                <Text size="md" c="dimmed">Items per page:</Text>
                <Select
                    size="sm"
                    withCheckIcon={false}
                    w={70}
                    data={['10', '15', '20', '30']}
                    value={filter.pageSize.toString()}
                    onChange={(val) => setFilter(prev => ({ ...prev, page: 0, pageSize: Number(val) }))}
                />
                <Pagination
                    size="md" // Smaller height
                    value={filter.page + 1}
                    onChange={(p) => setFilter((prev) => ({ ...prev, page: p - 1 }))}
                    total={Math.ceil((allRestores?.totalCount ?? 0) / filter.pageSize)}
                    withEdges
                />
            </Group>
        </Container>
    );
}
