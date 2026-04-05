import {readFile} from "node:fs/promises";
import type {FilterQuery} from "@backstream/shared";

export async function getLogs(stdout: string | null): Promise<string[]> {
    if (stdout === null) return [];
    try {
        // Read both files concurrently to save time
        const stdoutRaw = await readFile(stdout, 'utf-8');
        // Split by newline (handles \n and \r\n)
        const stdoutLines = stdoutRaw.split(/\r?\n/);
        // Remove the trailing empty line often left by loggers at the end of a file
        const cleanStdout = stdoutLines.filter((line, i) => line !== "" || i !== stdoutLines.length - 1);
        return [...cleanStdout];
    } catch (error) {
        return [`Failed to read logs: ${(error as Error).message}`];
    }
}

export function getTimeRange(filter: FilterQuery) {
    const start = Math.max(0, filter.startTime ?? 0);
    let end = Date.now();
    if (filter.endTime !== undefined && filter.endTime !== 0) {
        end = filter.endTime;
    }
    return { start, end };
}