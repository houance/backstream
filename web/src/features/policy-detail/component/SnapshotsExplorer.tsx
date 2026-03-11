import {
    Stack, Accordion, Center, Loader, Text,
    Paper,
    Group,
    SegmentedControl, Pagination, LoadingOverlay, Select
} from '@mantine/core';
import { DatePickerInput } from "@mantine/dates";
import {
    IconCloud, IconDatabase
} from '@tabler/icons-react';
import {useState} from 'react';
import {
    type FilterQuery,
    type FinishedSnapshotsMetaSchema, type SnapshotFile,
    type UpdateBackupPolicySchema
} from "@backstream/shared";
import { SnapshotRow } from "./SnapshotRow.tsx";
import {keepPreviousData, useMutation, useQuery} from "@tanstack/react-query";
import {client} from "../../../api";
import { notice } from 'src/util/notification.tsx';
import {formatTimeString} from "../../../util/format.ts";
import dayjs from "dayjs";

export default function SnapshotsExplorer({ policy }: { policy: UpdateBackupPolicySchema}) {
    const today = dayjs();
    // filter query state
    const [filter, setFilter] = useState<FilterQuery>({
        page: 0,
        pageSize: 15,
        startTime: 0,
        endTime: 0
    });
    const [openedSnapshot, setOpenedSnapshot] = useState<FinishedSnapshotsMetaSchema | null>(null);
    const targets = policy.targets || [];
    // 1. Initialize state with the first target's ID
    const [selectedTargetId, setSelectedTargetId] = useState<string>(
        targets.length > 0 ? targets[0].id.toString() : ''
    );
    // --- 1. FETCH SNAPSHOT DATA ---
    const {data: allSnapshots, isPending: isSnapshotsLoading, isPlaceholderData} = useQuery({
        queryKey: ['snapshots', policy.strategy.id, selectedTargetId, filter],
        queryFn: async () => {
            const res = await client.api.snapshot['all-snapshots'].$post({
                json: {
                    targetId: Number(selectedTargetId),
                    filterQuery: filter
                }
            });
            if (!res.ok) throw new Error('Failed to fetch all snapshots');
            return res.json();
        },
        enabled: !!selectedTargetId,
        staleTime: 5000,
        placeholderData: keepPreviousData
    });
    // --- 2. FETCH SNAPSHOT FILE DATA ---
    const {data: snapshotFiles, isPending: isSnapshotFilesLoading} = useQuery({
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
    // --- 3. RESTORE SNAPSHOT FILE ---
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
    // set opened snapshot to trigger file fetch
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

    if (targets.length === 0) return (
        <Center h={200}>
            <Text c="dimmed">No targets defined for this policy.</Text>
        </Center>
    );

    if (isSnapshotsLoading && !isPlaceholderData) {
        return (
            <Center h={400}>
                <Loader size="xl"/>
            </Center>
        );
    }

    return (
        <Stack pt="md" gap="lg">
            {/* 1. CLEAN TARGET SELECTOR AT THE TOP */}
            {targets.length > 1 && (
                <SegmentedControl
                    fullWidth
                    size="sm"
                    value={selectedTargetId}
                    onChange={(val) => {
                        setSelectedTargetId(val);
                        handleFinishedSnapshotOpen(null);
                    }}
                    data={targets.map(t => ({
                        label: (
                            <Center style={{ gap: 8 }}>
                                {t.repository.repositoryType !== 'LOCAL' ? <IconCloud size={14}/> : <IconDatabase size={14}/>}
                                <Text size="xs" fw={500}>{t.repository.name}</Text>
                            </Center>
                        ),
                        value: t.id.toString()
                    }))}
                />
            )}
            {/* 2. SNAPSHOT AREA WITH FILTERS AT THE TOP RIGHT */}
            <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)" pos="relative">
                <Stack gap="xs" pos="relative">
                    <LoadingOverlay visible={isPlaceholderData} overlayProps={{ blur: 1 }} />
                    {/* ACTION BAR: DATE PICKER & RESET PUSHED TO RIGHT */}
                    <DatePickerInput
                        type="range"
                        placeholder="Filter by date range"
                        size="sm" // Extra small for a compact filter look
                        w={280}
                        value={[
                            filter.startTime ? new Date(filter.startTime) : null,
                            filter.endTime ? new Date(filter.endTime) : null
                        ]}
                        onChange={(dates) => {
                            const [start, end] = dates;
                            setFilter((prev) => ({
                                ...prev,
                                page: 0,
                                startTime: formatTimeString(start),
                                endTime: formatTimeString(end),
                            }));
                        }}
                        clearable
                        presets={[
                            {
                                value: [
                                    today.subtract(2, 'day').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('day').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'Last two days',
                            },
                            {
                                value: [
                                    today.subtract(7, 'day').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('day').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'Last 7 days',
                            },
                            {
                                value: [
                                    today.startOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('month').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'This month',
                            },
                            {
                                value: [
                                    today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                ],
                                label: 'Last month',
                            },
                            {
                                value: [
                                    today.subtract(1, 'year').startOf('year').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.subtract(1, 'year').endOf('year').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                ],
                                label: 'Last year',
                            },
                        ]}
                    />
                    {/* SNAPSHOT ROWS */}
                    <Accordion variant="unstyled" onChange={(id) => handleFinishedSnapshotOpen(id)}>
                        {allSnapshots?.finishedSnapshot.map(s => (
                            <SnapshotRow
                                key={s.snapshotId}
                                data={s}
                                files={snapshotFiles ?? []}
                                isLoading={openedSnapshot === s && isSnapshotFilesLoading}
                                onDownload={restoreMutate.mutate}
                                isDownloading={restoreMutate.isPending}
                            />
                        ))}
                    </Accordion>
                    {/* PAGINATION & PAGE SIZE FOOTER */}
                    <Group justify="flex-end" gap="sm" mt="md">
                        <Text size="xs" c="dimmed">Items per page:</Text>
                        <Select
                            size="xs"
                            withCheckIcon={false}
                            w={70}
                            data={['10', '15', '20', '30']}
                            value={filter.pageSize.toString()}
                            onChange={(val) => setFilter(prev => ({ ...prev, page: 0, pageSize: Number(val) }))}
                        />
                        <Pagination
                            size="sm" // Smaller height
                            value={filter.page + 1}
                            onChange={(p) => setFilter((prev) => ({ ...prev, page: p - 1 }))}
                            total={Math.ceil((allSnapshots?.totalFinishedCount ?? 0) / filter.pageSize)}
                            withEdges
                        />
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
}
