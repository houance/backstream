import React, {useState} from 'react';
import {Button, Container, Group} from '@mantine/core';
import {IconPlus} from '@tabler/icons-react';
import { notice } from "../../util/notification.tsx";
import StorageLocationModal from './components/StorageLocationsModal.tsx';
import StorageLocationTable from "./components/StorageLocationTable.tsx";
import type {InsertRepositorySchema, UpdateRepositorySchema} from "@backstream/shared";
import {useDisclosure} from "@mantine/hooks";

const StorageLocationsPage: React.FC = () => {
    // 1. Manage state for opening/closing and the data to edit
    const [opened, { open, close }] = useDisclosure(false);
    const [editingItem, setEditingItem] = useState<UpdateRepositorySchema | null>(null);
    const data: UpdateRepositorySchema[] = [
        {
            id: 1,
            name: "Primary NAS Storage",
            path: "/mnt/nas/backup01",
            repositoryType: "SFTP",
            usage: 3400000000000,
            capacity: 5000000000000,
            repositoryStatus: "Active",
            certification: {
                RESTIC_PASSWORD: "123456",
            }
        },
        {
            id: 2,
            name: "Cloud Storage (AWS S3)",
            path: "s3://backup-vault-prod",
            repositoryType: "S3",
            usage: 4900000000000,
            capacity: 5000000000000,
            repositoryStatus: "Active",
            certification: {
                RESTIC_PASSWORD: "990608",
            }
        },
        {
            id: 3,
            name: "Cloud Storage (Backblaze B2)",
            path: "s3://backup-1-prod",
            repositoryType: "BACKBLAZE_B2",
            usage: 1200000000000,
            capacity: 5000000000000,
            repositoryStatus: "Disconnected",
            certification: {
                RESTIC_PASSWORD: "159357",
            }
        }
    ];

    const handleCreate = () => {
        setEditingItem(null);
        open();
    }
    const handleEdit = (item: UpdateRepositorySchema) => {
        setEditingItem(item);
        open();
    };
    const deleteStorageLocation = async (item: UpdateRepositorySchema) => {
        notice(true, `delete item ${item.name}`)
    };
    const submitCreateOrUpdate = async (item: InsertRepositorySchema | UpdateRepositorySchema) => {
        if (item.id) {
            // EDIT: Update existing item
            notice(true, `update storage location ${item.name}`);
        } else {
            notice(true, `create storage location ${item.name}`);
        }
    };
    const handleTestConnection = async (item: InsertRepositorySchema | UpdateRepositorySchema) => {
        notice(true, `connection ${item.name} success`)
    }

    return (
        <Container fluid p={0}>
            {/* Storage Location 数据展示 */}
            <StorageLocationTable
                data={data}
                onEdit={(item) => handleEdit(item)}
                onDelete={(item) => deleteStorageLocation(item)}/>
            {/* Add Storage Location Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{borderTop: '1px solid var(--mantine-color-gray-3)'}}>
                <Button leftSection={<IconPlus size="1rem"/>} variant="filled" onClick={handleCreate}>
                    Add Location
                </Button>
            </Group>
            {/* The modal component instance */}
            <StorageLocationModal
                key={editingItem?.id ?? 'create-storage-location'}
                onSubmit={(item) => submitCreateOrUpdate(item)}
                onTestConnection={(item) => handleTestConnection(item)}
                title={editingItem ? "Edit storage location" : "Create storage location"}
                opened={opened}
                onClose={close}
                data={editingItem} />
        </Container>
    );
};

export default StorageLocationsPage;
