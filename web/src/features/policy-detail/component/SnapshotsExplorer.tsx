import {
    TextInput,
    Stack, Accordion,
} from '@mantine/core';
import {
    IconSearch
} from '@tabler/icons-react';
import {useState} from 'react';
import type {SnapshotsMetaSchema, OnGoingSnapshotsMetaSchema, ScheduledSnapshotsMetaSchema} from "@backstream/shared";
import {SnapshotRow} from "./SnapshotRow.tsx";

export default function SnapshotsExplorer() {

    const [search, setSearch] = useState('');

    const scheduledSnapshots: ScheduledSnapshotsMetaSchema[] = [{
        uuid: "432",
        status: 'scheduled',
        createdAtTimestamp: 1770192202644
    }];

    const onGoingSnapshots: OnGoingSnapshotsMetaSchema[] = [{
        uuid: "1",
        status: 'backing up',
        createdAtTimestamp: 1770189649727,
        progress: {
            percent: '45%',
            logs: [
                '[restic] scanning...',
                '[restic] found 432 files',
                '[restic] uploading blob a8f21...',
                '[restic] 45% complete...'
            ]
        },
        totalSize: 21000000
    }]
    const snapshots: SnapshotsMetaSchema[] = [
        {
            snapshotsId: 'a1b2c',
            status: 'complete',
            createdAtTimestamp: 1770189649727,
            files: [
                {
                    name: 'config.yaml', type: 'file', size: 120000, mtime: 1770189649727, path: '/home/config.yaml',
                },
                {
                    name: 'hello.yaml', type: 'file', size: 120000, mtime: 1770189649727, path: '/etc/hello.yaml',
                },
                {name: 'home', type: 'dir', size: 0, mtime: 1770189649727, path: '/home'},
                {name: 'etc', type: 'dir', size: 0, mtime: 1770189649727, path: '/etc'},
                {name: 'backup_log.txt', type: 'file', size: 450000, mtime: 1770189649727, path: '/backup_log.txt',}
            ],
            size: 21000000
        }
    ];

    return (
        <Stack pt="md">
            <TextInput
                placeholder="Search snapshots by ID or Date..."
                leftSection={<IconSearch size={16}/>}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
            />

            <Accordion variant="separated">
                {/* 1. On-Going Snapshots */}
                {onGoingSnapshots.map(s => (
                    <SnapshotRow key={s.uuid} data={s} />
                ))}

                {/* 2. Scheduled Snapshots */}
                {scheduledSnapshots.map(s => (
                    <SnapshotRow key={s.uuid} data={s} />
                ))}

                {/* 3. Completed/Finished Snapshots */}
                {snapshots.map(s => (
                    <SnapshotRow key={s.snapshotsId} data={s} />
                ))}
            </Accordion>
        </Stack>
    );
}
