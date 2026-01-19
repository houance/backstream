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

export interface ResticResult {
    success: boolean;
    exitCode: ExitCode;
    stdout: string;
    stderr: string;
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

export interface Progress {
    totalBytes?: number;
    bytesDone?: number;
    percentDone: number;
}

export interface Task {
    uuid: string;
    command: string;
    logFile: string;
    errorFile: string;
    getResult: () => Promise<ExitCode>;
    cancel: () => void;
    getProgress: () => Progress;
    restoreFile?: string
}