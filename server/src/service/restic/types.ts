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

export type ResticResult =
    | { success: true; exitCode: ExitCode.Success; }
    | { success: false; exitCode: ExitCode; stderr: string };

export interface ResticEnv {
    RESTIC_REPOSITORY: string; // restic -r <path>
    RESTIC_PASSWORD: string;
    certificate?: Record<string, string>[];
}