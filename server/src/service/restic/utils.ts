import {ExitCode, type ResticResult} from "./types.js";
import type {Repository} from "../db/index.js";
import {execa, type Result} from "execa";

export function parseExitCodeFromResult(input: number | undefined): ExitCode {
    // Check if the input exists as a value in the Enum
    if (input !== undefined && input in ExitCode) {
        return input as ExitCode;
    }
    return ExitCode.UNKNOWN;
}

export async function execute(
    commandArgs: string[],
    repository: Repository,
    jsonFormat: boolean=true
):Promise<ResticResult> {
    const command = 'restic --'
    const result: Result = await execa('restic', commandArgs, {
        env: {

        },
        reject: false
    });
}