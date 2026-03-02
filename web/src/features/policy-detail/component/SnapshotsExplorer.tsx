import {
    TextInput,
    Stack, Accordion, Center, Loader,
} from '@mantine/core';
import {
    IconSearch
} from '@tabler/icons-react';
import {useState} from 'react';
import type {
    FinishedSnapshotsMetaSchema, SnapshotFile,
    UpdateBackupPolicySchema
} from "@backstream/shared";
import {SnapshotRow} from "./SnapshotRow.tsx";
import {useMutation, useQuery} from "@tanstack/react-query";
import {client} from "../../../api";
import { notice } from 'src/util/notification.tsx';

export default function SnapshotsExplorer({ policy }: { policy: UpdateBackupPolicySchema}) {
    const [search, setSearch] = useState('');
    const [openedSnapshot, setOpenedSnapshot] = useState<FinishedSnapshotsMetaSchema | null>(null);
    // --- 1. FETCH DATA ---
    const {data: allSnapshots, isLoading: isSnapshotsLoading} = useQuery({
        queryKey: ['snapshots'],
        queryFn: async () => {
            const res = await client.api.snapshot['all-snapshots'].$post({
                json: policy
            });
            if (!res.ok) throw new Error('Failed to fetch all snapshots');
            return res.json();
        },
        staleTime: 0,
        refetchInterval: 3000
    });
    // --- 2. FETCH DATA ---
    const {data: snapshotFiles, isLoading: isSnapshotFilesLoading} = useQuery({
        queryKey: ['files', openedSnapshot?.snapshotId],
        queryFn: async () => {
            const res = await client.api.snapshot['files'].$post({
                json: openedSnapshot!
            });
            if (!res.ok) throw new Error('Failed to fetch snapshot files');
            return res.json();
        },
        enabled: !!openedSnapshot,
        staleTime: Infinity
    });
    // --- 3. RESTORE FILE ---
    const restoreMutate = useMutation({
        mutationFn: async (file: SnapshotFile) => {
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

    const handleFinishedSnapshotOpen = (value: string | null) => {
        if (value === null) return;
        if (!allSnapshots) return;
        let hit = false;
        allSnapshots.finishedSnapshot.forEach(snapshot => {
            if (value === snapshot.snapshotId) {
                hit = true;
                setOpenedSnapshot(snapshot);
            }
        })
        if (!hit) setOpenedSnapshot(null);
    }

    if (isSnapshotsLoading) {
        return (
            <Center h={400}>
                <Loader size="xl"/>
            </Center>
        );
    }

    return (
        <Stack pt="md">
            <TextInput
                placeholder="Search snapshots by ID or Date..."
                leftSection={<IconSearch size={16}/>}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
            />

            <Accordion
                variant="separated"
                onChange={handleFinishedSnapshotOpen}
            >
                {/* 1. Ongoing Snapshots */}
                {allSnapshots!.onGoingSnapshot.map(s => (
                    <SnapshotRow key={s.uuid} data={s} />
                ))}

                {/* 2. Scheduled Snapshots */}
                {allSnapshots!.scheduleSnapshot.map(s => (
                    <SnapshotRow key={s.uuid} data={s} />
                ))}

                {/* 3. Completed/Finished Snapshots */}
                {allSnapshots!.finishedSnapshot.map(s => (
                    <SnapshotRow
                        key={s.snapshotId}
                        data={s}
                        files={openedSnapshot === s ? snapshotFiles : []}
                        isLoading={openedSnapshot === s && isSnapshotFilesLoading}
                        onDownload={restoreMutate.mutate}
                        isDownloading={restoreMutate.isPending}
                    />
                ))}
            </Accordion>
        </Stack>
    );
}
