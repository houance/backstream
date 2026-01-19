import {ExitCode, type ResticResult, type Node} from "./types.js";
import {execa, type Options, type Result, type ResultPromise} from "execa";
import {tmpdir} from "node:os";
import {mkdtempSync} from "node:fs";
import {join} from "node:path";

export function parseExitCodeFromResult(input: number | undefined): ExitCode {
    // Check if the input exists as a value in the Enum
    if (input !== undefined && input in ExitCode) {
        return input as ExitCode;
    }
    return ExitCode.UNKNOWN;
}

export function getParentPathFromNode(node: Node): string {
    if ("/" === node.path) {
        return "/";
    }
    return node.path.lastIndexOf("/") === 0 ?
        "/" :
        node.path.substring(0, node.path.lastIndexOf("/"));
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
            RESTIC_PROGRESS_FPS: '60'
        }
    });
}

// execute short living command, timeout at 30 seconds
export async function execute(
    command: string,
    options: Options,
    commandPath?: string,
):Promise<ResticResult> {
    // Split command into arguments (e.g., "restic backup" -> ["restic", "backup"])
    let args = command.split(' ');
    // If commandPath is set, replace the executable (the first element)
    if (commandPath) {
        args[0] = commandPath;
    }
    // run command
    const result: Result = await execa(args[0], args.slice(1), {
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
    return {
        success: !result.failed,
        exitCode: parseExitCodeFromResult(result.exitCode),
        stdout: typeof result.stdout === 'string' ? result.stdout as string : "",
        stderr: typeof result.stderr === 'string' ? result.stderr as string : ""
    }
}