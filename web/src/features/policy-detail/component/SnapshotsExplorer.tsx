import {
    TextInput,
    Stack, Accordion, Center, Loader, Text,
    Box,
    Badge,
    Group,
    SegmentedControl,
} from '@mantine/core';
import {
    IconCloud, IconDatabase,
    IconSearch
} from '@tabler/icons-react';
import {useState} from 'react';
import {
    type FinishedSnapshotsMetaSchema, RepoType, type SnapshotFile,
    type UpdateBackupPolicySchema
} from "@backstream/shared";
import {SnapshotRow} from "./SnapshotRow.tsx";
import {useMutation, useQuery} from "@tanstack/react-query";
import {client} from "../../../api";
import { notice } from 'src/util/notification.tsx';

export default function SnapshotsExplorer({ policy }: { policy: UpdateBackupPolicySchema}) {
    const [search, setSearch] = useState('');
    const [openedSnapshot, setOpenedSnapshot] = useState<FinishedSnapshotsMetaSchema | null>(null);
    const targets = policy.targets || [];
    // 1. Initialize state with the first target's ID
    const [selectedTargetId, setSelectedTargetId] = useState<string>(
        targets.length > 0 ? targets[0].id.toString() : ''
    );
    // --- 1. FETCH DATA ---
    const {data: allSnapshots, isLoading: isSnapshotsLoading} = useQuery({
        queryKey: ['snapshots', policy.strategy.id, selectedTargetId],
        queryFn: async () => {
            const res = await client.api.snapshot['all-snapshots'][':targetId'].$get({
                param: { targetId: String(selectedTargetId) }
            });
            if (!res.ok) throw new Error('Failed to fetch all snapshots');
            return res.json();
        },
        enabled: !!selectedTargetId,
        staleTime: 5000,
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
        enabled: !!openedSnapshot && !!allSnapshots,
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
    if (targets.length === 0) return (
        <Center h={200}>
            <Text c="dimmed">No targets defined for this policy.</Text>
        </Center>
    );

    return (
        <Stack pt="md" gap="lg">
            {/* MULTI-TARGET SELECTOR (Only shows if > 1 target) */}
            {targets.length > 1 && (
                <Box>
                    <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={600} c="dimmed">Select Storage Destination</Text>
                        <Badge variant="outline">{targets.length} Targets</Badge>
                    </Group>
                    <SegmentedControl
                        fullWidth
                        size="md"
                        value={selectedTargetId}
                        onChange={(val) => {
                            setSelectedTargetId(val);
                            handleFinishedSnapshotOpen(null); // Reset explorer when switching targets
                        }}
                        data={targets.map(t => ({
                            label: (
                                <Center style={{ gap: 8 }}>
                                    {t.repository.repositoryType !== RepoType.LOCAL ? <IconCloud size={16}/> : <IconDatabase size={16}/>}
                                    <Text size="sm">{t.repository.name}</Text>
                                </Center>
                            ),
                            value: t.id.toString()
                        }))}
                    />
                </Box>
            )}

            <Stack gap="xs">
                <TextInput
                    placeholder="Search snapshots..."
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />

                {isSnapshotsLoading ? (
                    <Center h={300}><Loader size="xl" variant="dots" /></Center>
                ) : (
                    <Accordion
                        variant="separated"
                        onChange={(id) => handleFinishedSnapshotOpen(id)}
                    >
                        {/* 1. Running */}
                        {allSnapshots?.onGoingSnapshot.map(s => (
                            <SnapshotRow key={s.uuid} data={s} />
                        ))}

                        {/* 2. Scheduled */}
                        {allSnapshots?.scheduleSnapshot.map(s => (
                            <SnapshotRow key={s.uuid} data={s} />
                        ))}

                        {/* 3. Finished */}
                        {allSnapshots?.finishedSnapshot
                            .filter(s => s.snapshotId.includes(search)) // Simple local filter
                            .map(s => (
                                <SnapshotRow
                                    key={s.snapshotId}
                                    data={s}
                                    files={openedSnapshot === s ? snapshotFiles : []}
                                    onDownload={restoreMutate.mutate}
                                    isLoading={openedSnapshot === s && isSnapshotFilesLoading}
                                />
                            ))
                        }
                    </Accordion>
                )}
            </Stack>
        </Stack>
    );
}
