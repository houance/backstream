import { IconDatabase, IconCopy, IconCloudUpload } from '@tabler/icons-react';
import LocalBackupForm from './components/LocalBackupForm';

// Single source for all policy metadata
export const BACKUP_POLICIES = {
    'local-backup': {
        label: 'Local Backup',
        description: 'Versioned backup to a local disk or NAS.',
        icon: IconDatabase,
        component: LocalBackupForm,
    },
    'local-mirror': {
        label: 'Local Mirror',
        description: '1:1 directory sync without versioning.',
        icon: IconCopy,
        component: null,
    },
    '3-2-1-strategy': {
        label: '3-2-1 Strategy',
        description: 'The gold standard: local + cloud redundancy.',
        icon: IconCloudUpload,
        component: null,
    },
} as const;

export type PolicyType = keyof typeof BACKUP_POLICIES;
