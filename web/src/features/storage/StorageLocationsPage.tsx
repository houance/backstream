import React, {useRef, useState} from 'react';
import {Button, Container, Group} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {IconCheck, IconPlus, IconX} from '@tabler/icons-react';
import StorageLocationModal, {type ModalRef} from './components/StorageLocationsModal.tsx';
import StorageLocationTable from "./components/StorageLocationTable.tsx";
import type {RepositorySchema} from "@backstream/shared";

const StorageLocationsPage: React.FC = () => {
    const [modalTitle, setModalTitle] = useState("Add New Storage Location"); // New state
    const [data] = useState<RepositorySchema[]>([
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
    ]);

    const notice = (success: boolean, msg: string) => {
        if (success) {
            notifications.show({
                title: 'Success!',
                message: msg,
                color: 'teal',
                icon: <IconCheck size={18}/>,
                autoClose: 3000,
            });
        } else {
            notifications.show({
                title: 'Submission Failed',
                message: msg,
                color: 'red',
                icon: <IconX size={18}/>,
                autoClose: 5000,
            });
        }
    }

    const modalRef = useRef<ModalRef>(null);
    const openModalAsBlank = () => {
        setModalTitle("Add New Storage Location");
        modalRef.current?.reset();
        modalRef.current?.open();
    }
    const editStorageLocation = (item: RepositorySchema) => {
        setModalTitle("Edit Storage Location");
        modalRef.current?.setData(item); // Pre-fill modal with row data
        modalRef.current?.open();
    };
    const deleteStorageLocation = (item: RepositorySchema) => {
        notice(true, `delete item ${item.name}`)
    };
    const addOrUpdateStorageLocation = (item: RepositorySchema) => {
        if (item.id) {
            // EDIT: Update existing item
            notice(true, `update storage location ${item.name}`);
        } else {
            notice(true, `create storage location ${item.name}`);
        }
    };

    return (
        <Container fluid p={0}>
            {/* Storage Location 数据展示 */}
            <StorageLocationTable
                data={data}
                onEdit={(item) => editStorageLocation(item)}
                onDelete={(item) => deleteStorageLocation(item)}/>
            {/* Add Storage Location Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{borderTop: '1px solid var(--mantine-color-gray-3)'}}>
                <Button leftSection={<IconPlus size="1rem"/>} variant="filled" onClick={openModalAsBlank}>
                    Add Location
                </Button>
            </Group>
            {/* The modal component instance */}
            <StorageLocationModal
                ref={modalRef}
                onSubmit={(item) => addOrUpdateStorageLocation(item)}
                title={modalTitle} />
        </Container>
    );
};

export default StorageLocationsPage;
