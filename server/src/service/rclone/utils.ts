import {execa, type Options, type Result} from "execa";

// execute short living command, timeout at 10 seconds
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
            RCLONE_FAST_LIST: 'true'
        }
    });
}