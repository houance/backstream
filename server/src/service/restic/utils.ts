import {ExitCode, type Node} from "./types";
import {execa, type Options, type Result, type ResultPromise} from "execa";
import {tmpdir} from "node:os";
import {mkdtempSync} from "node:fs";
import {join} from "node:path";

export function mapResticCode(input: number | undefined): ExitCode {
    // Check if the input exists as a value in the Enum
    if (input !== undefined && Object.values(ExitCode).includes(input as any)) {
        return input as ExitCode;
    }
    return ExitCode.UNKNOWN;
}

export function getParentPathFromNode(path: string): string {
    if ("/" === path) {
        return "/";
    }
    return path.lastIndexOf("/") === 0 ?
        "/" :
        path.substring(0, path.lastIndexOf("/"));
}

export function createTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'backstream-'))
}

export function executeStream(
    command: string,
    logFile: string,
    errorFile: string,
    options: Options,
    commandPath?: string,
):ResultPromise {
    // Split command into arguments (e.g., "restic backup" -> ["restic", "backup"])
    let args = command.split(' ');
    // If commandPath is set, replace the executable (the first element)
    if (commandPath) {
        args[0] = commandPath;
    }
    return execa(args[0], args.slice(1), {
        ...options,
        stdout: [{ file: logFile, append: true}, 'pipe'],
        stderr: [{ file: errorFile, append: true }, 'pipe'],
        reject: false,
        buffer: false,
        cleanup: true,
        forceKillAfterDelay: 10000, // kill after sigterm send in 10 seconds
        timeout: Math.max(options.timeout ?? 7200000, 7200000), // timout 2 hours
        env: {
            ...options.env,
            RESTIC_PROGRESS_FPS: '0.2', // 5 second report rate
            GOMAXPROCS: '2',
        }
    });
}

// execute short living command, timeout at 30 seconds
export async function execute(
    command: string,
    options: Options,
    commandPath?: string,
):Promise<Result> {
    // Split command into arguments (e.g., "restic backup" -> ["restic", "backup"])
    let args = command.split(' ');
    // If commandPath is set, replace the executable (the first element)
    if (commandPath) {
        args[0] = commandPath;
    }
    // run command
    return execa(args[0], args.slice(1), {
        ...options,
        reject: false,
        buffer: true,
        cleanup: true,
        forceKillAfterDelay: 10000, // kill after sigterm send in 10 seconds
        timeout: Math.min(options.timeout ?? 10000, 10000), // timeout max 10 seconds
        env: {
            ...options.env,
            RESTIC_PROGRESS_FPS: '0.5'
        }
    });
}