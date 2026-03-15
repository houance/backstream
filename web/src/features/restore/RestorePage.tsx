import { useState } from 'react';
import {useQuery, useMutation, useQueryClient, keepPreviousData} from '@tanstack/react-query';
import RestoreTable from './component/RestoreTable';
import {ensureSuccess} from "../../util/api.ts";
import { client } from 'src/api/index.ts';
import type {FilterQuery} from "@backstream/shared";
import {notice} from "../../util/notification.tsx";
import {Center, Loader} from "@mantine/core";

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
    const { data: restores, isPending: isRestoresLoading, isPlaceholderData } = useQuery({
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
        enabled: !!restores && !!activeLogId,
        staleTime: 5000,
        placeholderData: keepPreviousData
    });
    // --- 3. DOWNLOAD RESTORE FILE ---
    const restoreDownloadMutate = useMutation({
        mutationFn: async (id: number) => {
            // 1. Send request and get Key
            const submitRes = await client.api.snapshot['submit-restore'].$post({ json: file });
            if (!submitRes.ok) throw new Error('Initial restore request failed');
            const jobKey = await submitRes.json();
            // 2. Polling status by key
            let isFinished = false;
            let attempts = 0;
            const DELAY = 2000;
            const MAX_ATTEMPTS = 30; // ~1 minute if polling every 2s

            while (!isFinished && attempts < MAX_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, DELAY)); // Wait 2 seconds between polls
                attempts++;
                const statusRes = await client.api.snapshot['check-restore-status'].$post({ json: jobKey });
                if (!statusRes.ok) throw new Error('Failed to check restore status');
                // check restore status
                const { status } = await statusRes.json();
                if (status === 'success') {
                    isFinished = true;
                    // HEAD CHECK if file exist
                    const headRes = await client.api.snapshot['restore-file'].$get({
                        query: { key: JSON.stringify(jobKey) },
                        init: { method: 'HEAD' } // Trigger HEAD instead of GET
                    });
                    if (!headRes.ok) {
                        console.warn('Restore reported success, but file is missing on server.');
                        return { success: false, error: 'file_not_found' };
                    }
                    // Trigger actual browser download
                    const downloadUrl = client.api.snapshot['restore-file'].$url({
                        query: { key: JSON.stringify(jobKey) }
                    });
                    const a = document.createElement('a');
                    a.download = ''; // set to empty use server header
                    a.href = downloadUrl.toString();
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                if (status === 'fail' || status === 'delete') {
                    throw new Error(`Restore job ${status} on server.`);
                }
            }
            if (!isFinished) {
                throw new Error(`Restore timed out after ${DELAY}ms * ${MAX_ATTEMPTS}`);
            }
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
        <RestoreTable
            data={restores || []}
            activeLogId={activeLogId}
            logs={logs}
            onToggleLog={handleToggleLog}
            onDownload={restoreDownloadMutate.mutate}
            onDelete={deleteRestore.mutate}
        />
    );
}
