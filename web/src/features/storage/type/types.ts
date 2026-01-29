export const STORAGE_TYPES = ['S3', 'SFTP', 'Local', 'Backblaze B2', 'Aliyun OSS'] as const;
export type StorageType = typeof STORAGE_TYPES[number];

export interface StorageLocation {
    id: number;
    name: string;
    path: string;
    type: StorageType;
    usage: number;
    capacity: number;
    status: 'Active' | 'Warning';
    certification?: {
        password: string;
        certificate?: Record<string, string>[];
    }
}