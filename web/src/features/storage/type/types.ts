import { type RepoType } from "@backstream/shared"

export interface StorageLocation {
    id: number;
    name: string;
    path: string;
    type: RepoType;
    usage: number;
    capacity: number;
    status: 'Active' | 'Warning';
    certification?: {
        password: string;
        certificate?: Record<string, string>[];
    }
}