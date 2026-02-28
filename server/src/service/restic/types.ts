import type {Result} from "execa";

export const ExitCode = {
    Success: 0,
    Failure: 1,
    GoRuntimeError: 2,
    BackupReadError: 3,
    RepositoryDoesNotExist: 10,
    FailedToLockRepository: 11,
    WrongPassword: 12,
    Interrupted: 130,
    UNKNOWN: -1,
} as const;

export type ExitCode = typeof ExitCode[keyof typeof ExitCode];

export interface RepoConfig {
    version: number;
    id: string;
    chunkerPolynomial: string;
}

export interface Lock {
    time: string;
    exclusive: boolean;
    hostname: string;
    username: string;
    pid: number;
    uid: number,
    gid: number;
}

export class ResticError {
    readonly cmd: string;
    readonly exitCode: number;
    readonly stderr: string;
    readonly rawResult: Result;

    constructor(execaResult: Result, parseError?: any) {
        this.cmd = execaResult.command;
        this.exitCode = execaResult.exitCode as number;
        this.rawResult = execaResult;
        this.stderr = parseError ?
            parseError instanceof Error ? parseError.message : String(parseError) :
            execaResult.stderr as string;
    }

    public toString(): string {
        return `cmd:${this.cmd}\nexitCode:${this.exitCode}\nstderr:${this.stderr}`;
    }
}

export type ResticResult<T> =
    { success: true, result: T, rawResult: Result } |
    { success: false; error: ResticError};

export function success<T>(result: T, rawResult: Result): ResticResult<T> {
    return {success: true, result, rawResult};
}

export function fail<T>(rawResult: Result, parseError?: any): ResticResult<T> {
    return {success: false, error: new ResticError(rawResult, parseError)};
}

export interface Snapshot {
    time: Date;
    parent: string;
    tree: string;
    paths: string[];
    hostname: string;
    username: string;
    uid: number;
    gid: number;
    excludes: string[];
    tags: string[];
    programVersion: string;
    summary: SnapshotSummary;
    id: string;
    shortId: string;
}

// https://restic.readthedocs.io/en/stable/075_scripting.html#summary
// https://restic.readthedocs.io/en/stable/075_scripting.html#snapshots
export interface SnapshotSummary {
    backupStart: Date;
    backupEnd: Date;
    filesNew: number;
    filesChanged: number;
    filesUnmodified: number;
    dirsNew: number;
    dirsChanged: number;
    dirsUnmodified: number;
    dataBlobs: number;
    treeBlobs: number;
    dataAdded: number;
    dataAddedPacked: number;
    totalFilesProcessed: number;
    totalBytesProcessed: number;
    snapshotId?: string; // only return in backup command
}

export interface Node {
    messageType: string;
    name: string;
    type: string;
    path: string;
    uid: number;
    gid: number;
    size: number;
    mode: any; // Represents os.FileMode or similar file mode structure
    permissions: string;
    atime: Date;
    mtime: Date;
    ctime: Date;
    inode: number;
}

export interface CheckSummary {
    messageType: string;
    numErrors: number;
    brokenPacks: string[] | null;
    suggestRepairIndex: boolean;
    suggestPrune: boolean;
}

export interface Progress {
    totalBytes?: number;
    bytesDone?: number;
    percentDone: number;
}

export interface Task<T> {
    uuid: string;
    command: string;
    logFile: string;
    errorFile: string;
    result: Promise<T>;
    cancel: () => void;
    getProgress: () => Progress;
}

export interface ForgetGroup {
    tags: string[];
    host: string;
    paths: string[];
    keep: Snapshot[];
    remove: Snapshot[];
    reasons: KeepReason[];
}

export interface KeepReason {
    snapshot: Snapshot;
    matches: string[];
}