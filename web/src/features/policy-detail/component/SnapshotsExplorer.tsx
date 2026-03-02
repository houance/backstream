import {
    TextInput,
    Stack, Accordion, Center, Loader,
} from '@mantine/core';
import {
    IconSearch
} from '@tabler/icons-react';
import {useState} from 'react';
import type {
    FinishedSnapshotsMetaSchema,
    ScheduledSnapshotsMetaSchema,
    UpdateBackupPolicySchema
} from "@backstream/shared";
import {SnapshotRow} from "./SnapshotRow.tsx";
import {useQuery} from "@tanstack/react-query";
import {client} from "../../../api";

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

    const scheduledSnapshots: ScheduledSnapshotsMetaSchema[] = [{
        uuid: "0",
        status: 'scheduled',
        createdAtTimestamp: policy.targets[0].nextBackupAt
    }];

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
                {scheduledSnapshots.map(s => (
                    <SnapshotRow key={s.uuid} data={s} />
                ))}

                {/* 3. Completed/Finished Snapshots */}
                {allSnapshots!.finishedSnapshot.map(s => (
                    <SnapshotRow
                        key={s.snapshotId}
                        data={s}
                        files={openedSnapshot === s ? snapshotFiles : []}
                        isLoading={openedSnapshot === s && isSnapshotFilesLoading}
                    />
                ))}
            </Accordion>
        </Stack>
    );
}
