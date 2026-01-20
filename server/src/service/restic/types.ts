import type {Result} from "execa";

export enum ExitCode {
    Success = 0,
    Failure = 1,
    GoRuntimeError = 2,
    BackupReadError = 3,
    RepositoryDoesNotExist = 10,
    FailedToLockRepository = 11,
    WrongPassword = 12,
    Interrupted = 130,
    UNKNOWN = -1, // not recognized exit code
}

export class ResticResult<T> {
    public success: boolean;
    public lock: boolean;
    public readonly rawExecResult: Result;
    public result?: T;
    public errorMsg?: string;

    private constructor(execaResult: Result, result?: T, parseError?: any) {
        this.rawExecResult = execaResult;
        if (result) { // exec success
            this.success = true;
            this.lock = false;
            this.result = result;
        } else if (parseError) { // exec success, result parse fail
            this.success = false;
            this.lock = false;
            this.errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        } else { // // exec failed
            this.success = false;
            this.lock = execaResult.exitCode === ExitCode.FailedToLockRepository;
            this.errorMsg = `Cmd: ${execaResult.command}. ` +
                `Exit Code: ${execaResult.exitCode}. ` +
                `Stderr: ${execaResult.stderr}`
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

export interface ResticEnv {
    RESTIC_REPOSITORY: string; // restic -r <path>
    RESTIC_PASSWORD: string;
    certificate?: Record<string, string>[];
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