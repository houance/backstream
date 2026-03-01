import type {Result} from "execa";

/**
 * Rclone Exit Codes
 * @see https://rclone.org/docs/#exit-code
 */
export const RcloneExitCode = {
    SUCCESS: 0,
    GENERAL_ERROR: 1, // Error not otherwise categorised
    SYNTAX_ERROR: 2,  // Syntax or usage error
    DIR_NOT_FOUND: 3,
    FILE_NOT_FOUND: 4,
    RETRY_ERROR: 5,   // Temporary error (Retry errors)
    NO_RETRY_ERROR: 6, // Less serious errors (NoRetry errors)
    FATAL_ERROR: 7,    // Fatal error (Fatal errors)
    TRANSFER_LIMIT_EXCEEDED: 8,
    SUCCESS_NO_TRANSFER: 9,
    DURATION_EXCEEDED: 10,
} as const;
export type RcloneExitCode = typeof RcloneExitCode[keyof typeof RcloneExitCode];

export class RcloneError {
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

export type RcloneResult<T> =
    | { success: true; result: T, rawResult: Result }
    | { success: false; error: RcloneError; };

export function success<T>(result: T, rawResult: Result): RcloneResult<T> {
    return {success: true, result, rawResult};
}

export function fail<T>(rawResult: Result, parseError?: any): RcloneResult<T> {
    return {success: false, error: new RcloneError(rawResult, parseError)};
}

export interface Size {
    count: number;
    bytes: number;
    sizeless: number;
}

export interface About {
    total?: number;
    used: number;
    trashed?: number;
    other?: number;
    free?: number;
}