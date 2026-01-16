import {ExitCode, type ResticResult} from "./types.js";
import {execa, type Options, type Result, type Subprocess} from "execa";

export function parseExitCodeFromResult(input: number | undefined): ExitCode {
    // Check if the input exists as a value in the Enum
    if (input !== undefined && input in ExitCode) {
        return input as ExitCode;
    }
    return ExitCode.UNKNOWN;
}

export function executeStream(
    command: string,
    options?: Options,
    commandPath?: string,
):Subprocess {
    // Split command into arguments (e.g., "restic backup" -> ["restic", "backup"])
    let args = command.split(' ');
    // If commandPath is set, replace the executable (the first element)
    if (commandPath) {
        args[0] = commandPath;
    }
    return execa(args[0], args.slice(1), {
        reject: false,
        timeout: options?.timeout ?? 2400000, // timout 2 hours
        env: options?.env ?? {},
        // get options except reject, env, timeout
        ...(options && Object.fromEntries(Object.entries(options)
            .filter(([key]) =>
                key !== 'reject' && key !== 'env' && key !== 'timeout'))),
    });
}

// execute short living command, timeout at 30 seconds
export async function execute(
    command: string,
    options?: Options,
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
        reject: false,
        timeout: options?.timeout ?? 30000,
        env: options?.env ?? {},
        // get options except reject, env, timeout
        ...(options && Object.fromEntries(Object.entries(options)
            .filter(([key]) =>
                key !== 'reject' && key !== 'env' && key !== 'timeout'))),
    });
    if (!result.failed) {
        return {
            success: true,
            exitCode: ExitCode.Success
        }
    } else {
        return {
            success: false,
            exitCode: parseExitCodeFromResult(result.exitCode),
            stderr: typeof result.stderr === 'string' ? result.stderr as string : ""
        }
    }
}