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

export const RepoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;

export type RepoType = typeof RepoType[keyof typeof RepoType];

export interface RepoConfig {
    version: number;
    id: string;
    chunkerPolynomial: string;
}

export class ResticResult<T> {
    public success: boolean;
    public lock: boolean;
    public readonly rawExecResult: Result;
    public result?: T;
    public errorMsg?: string;

    private constructor(execaResult: Result, result?: T, parseError?: any) {
        this.rawExecResult = execaResult;
        if (result !== undefined) { // exec success
            this.success = true;
            this.lock = false;
            this.result = result;
            return;
        } else if (parseError !== undefined) { // exec success, result parse fail
            this.success = false;
            this.lock = false;
            this.errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            return;
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

export interface ResticCert {
    RESTIC_PASSWORD: string;
    // SFTP - SSH相关认证
    sftp?: {
        // SSH 相关（restic 依赖系统 SSH 配置）
        // 通常通过 SSH_AUTH_SOCK 使用 SSH 代理
        SSH_AUTH_SOCK?: string;        // SSH 代理套接字路径
    };
    // S3 (Amazon S3 或兼容服务)
    s3?: {
        AWS_ACCESS_KEY_ID?: string;     // AWS 访问密钥 ID
        AWS_SECRET_ACCESS_KEY?: string; // AWS 秘密访问密钥
        AWS_DEFAULT_REGION?: string;    // AWS 默认区域
        AWS_REGION?: string;            // AWS 区域（备选）
        AWS_ENDPOINT?: string;          // S3 自定义端点（用于兼容服务）
        AWS_PROFILE?: string;           // AWS 配置文件名
    };
    // Backblaze B2
    b2?: {
        B2_ACCOUNT_ID?: string;         // B2 账户 ID
        B2_ACCOUNT_KEY?: string;        // B2 账户密钥
    };
    // Aliyun OSS
    oss?: {
        OSS_ACCESS_KEY_ID?: string;     // OSS 访问密钥 ID
        OSS_SECRET_ACCESS_KEY?: string; // OSS 秘密访问密钥
        OSS_ENDPOINT?: string;          // OSS 端点地址
    };
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