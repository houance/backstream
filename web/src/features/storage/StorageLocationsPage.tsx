import React from 'react';
import {Card, Button, Table, Container, Group} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import StorageLocationRow from './components/StorageLocationRow';

const StorageLocationsPage: React.FC = () => {
    return (
        // Use w="100%" and remove maxWidth to override any inherited restrictions
        <Container fluid p={0}>
            {/* Added w="100%" to Card and Table */}
            <Card shadow="sm" p="lg" radius="md" withBorder mb="xl">
                <Table
                    striped
                    highlightOnHover
                    verticalSpacing="md"
                    layout="fixed" // Forces columns to distribute across 100% width
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Location Name</Table.Th>
                            <Table.Th>Path</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>Capacity</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th style={{ width: '120px' }}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        <StorageLocationRow name="Primary NAS Storage" path="/mnt/nas/backup01" type="NAS" capacity="3.4 TB / 5 TB" status="Active" />
                        <StorageLocationRow name="Cloud Storage (AWS S3)" path="s3://backup-vault-prod" type="Cloud" capacity="4.5 TB / 10 TB" status="Active" />
                        <StorageLocationRow name="Offsite Tape Library" path="/dev/tape/1to8" type="Tape" capacity="16.4 TB / 20 TB" status="Warning" />
                        <StorageLocationRow name="Local SSD Cache" path="/var/cache/backup" type="Local" capacity="680 GB / 2 TB" status="Active" />
                        <StorageLocationRow name="Azure Blob Storage" path="azure://backupvault" type="Cloud" capacity="2.1 TB / 8 TB" status="Active" />
                    </Table.Tbody>
                </Table>
            </Card>

            {/* Add Storage Location Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <Button leftSection={<IconPlus size="1rem" />} variant="filled">
                    Add Location
                </Button>
            </Group>
        </Container>
    );
};

export default StorageLocationsPage;
