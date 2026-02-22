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

export class ResticResult<T> {
    public success: boolean;
    public readonly rawExecResult: Result;
    public result?: T;
    public errorMsg?: {
        cmd: string;
        exitCode: number;
        stderr: string;
    };

    private constructor(execaResult: Result, result?: T, parseError?: any) {
        this.rawExecResult = execaResult;
        if (result !== undefined) { // exec success
            this.success = true;
            this.result = result;
        } else if (parseError !== undefined) { // exec success, result parse fail
            this.success = false;
            this.errorMsg = {
                cmd: execaResult.command,
                exitCode: execaResult.exitCode as ExitCode,
                stderr: parseError instanceof Error ? parseError.message : String(parseError)
            }
        } else { // // exec failed
            this.success = false;
            this.errorMsg = {
                cmd: execaResult.command,
                exitCode: execaResult.exitCode as ExitCode,
                stderr: execaResult.stderr as string
            }
        }
    }

    public static ok<T>(execaResult: Result, result: T): ResticResult<T> {
        return new ResticResult<T>(execaResult, result);
    }

    public static error<T>(execaResult: Result): ResticResult<T> {
        return new ResticResult<T>(execaResult);
    }

    public static parseError<T>(execaResult: Result, exception: string): ResticResult<T> {
        return new ResticResult<T>(execaResult, undefined, exception);
    }
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
    getProgress?: () => Progress;
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