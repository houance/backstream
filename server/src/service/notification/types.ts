import {type ExecutionStatus} from "@backstream/shared";

interface BaseMessage {
    executionId: number;
    uuid: string;
    status: ExecutionStatus;
    startedAt: number;
    duration: number;     // Calculated: finishedAt - startedAt
    errorMessage?: string;
    repositoryName: string;
}

export interface BackupMessage extends BaseMessage {
    type: 'backup';
    stats: { bytesAdded: number; snapshotsAdded: number; filesAdded: number };
    strategyName: string;
}

export interface CheckMessage extends BaseMessage {
    type: 'check';
    stats: { healthy: boolean; numErrors: number; brokenPacks: string[] | null; suggestRepairIndex: boolean; suggestPrune: boolean };
}

export interface PruneMessage extends BaseMessage {
    type: 'prune';
    stats: { };
}

// The Union
export type NotificationMessage = BackupMessage | CheckMessage | PruneMessage ;
