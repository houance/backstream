import {Modal, Tabs} from '@mantine/core';
import type {UpdateBackupPolicySchema} from "@backstream/shared";
import SnapshotExplorer from './component/SnapshotsExplorer.tsx';
import PolicySummary from "./component/PolicySummary.tsx";
import PolicyActionCenter from "./component/PolicyActionCenter.tsx";

interface ModalProps {
    opened: boolean;
    onClose: () => void;
    data: UpdateBackupPolicySchema
}

export function PolicyDetailModal({ opened, onClose, data }: ModalProps) {
    return (
        <Modal opened={opened} onClose={onClose} withCloseButton={false} size="90%"
            // Use styles to force a minimum or fixed height
               styles={{
                   content: {
                       height: '80vh', // Sets height to 80% of the viewport height
                       display: 'flex',
                       flexDirection: 'column',
                   },
                   body: {
                       flex: 1,       // Ensures the body fills the available height
                       overflowY: 'auto', // Adds scrolling if content is too long
                   }
               }}>
            <Tabs defaultValue="summary">
                <Tabs.List>
                    <Tabs.Tab value="summary">Summary</Tabs.Tab>
                    <Tabs.Tab value="snapshots">Snapshots</Tabs.Tab>
                    <Tabs.Tab value="actions">Actions</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="summary"><PolicySummary policy={data} /></Tabs.Panel>
                <Tabs.Panel value="snapshots"><SnapshotExplorer /></Tabs.Panel>
                <Tabs.Panel value="actions"><PolicyActionCenter /></Tabs.Panel>
            </Tabs>
        </Modal>
    );
}

export default PolicyDetailModal;
