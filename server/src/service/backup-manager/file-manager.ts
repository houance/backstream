import {createWriteStream, existsSync} from "node:fs";
import os from "node:os";
import {mkdtemp, writeFile, readdir, stat, rm} from "node:fs/promises";
import path from "node:path";
import type {UpdateExecutionSchema} from "@backstream/shared";
import archiver from "archiver";

export class FileManager {
    public static baseDirPath = null; // todo: read from env
    private static tmpFolderPrefix = "backstream-";

    public static getTmpFolderPath(): string {
        return FileManager.baseDirPath && existsSync(FileManager.baseDirPath)
            ? FileManager.baseDirPath
            : os.tmpdir();
    }

    public static async createTmpFolder() {
        // 1. Determine Root (Default to system temp)
        const root = FileManager.getTmpFolderPath();
        // create random folder with six figure suffix
        return await mkdtemp(path.join(root, FileManager.tmpFolderPrefix));
    }

    public static async createLogFile() {
        const logFolder = await FileManager.createTmpFolder();
        // 3. Create Files
        const logFile = path.join(logFolder, `stdout.log`);
        const errorFile = path.join(logFolder, `stderr.log`);
        await writeFile(logFile, '');
        await writeFile(errorFile, '');

        return {
            logFile,
            errorFile,
        };
    }

    public static async zip(file: string, zipName: string):
        Promise<{ success: true, result: string } | { success: false, error: any }> {
        // todo: linux 平台引入 zip cli, fallback to archiver. window 平台允许用户选择路径直接 restore
        const zipPath = path.join(path.dirname(file), `${zipName}.zip`);
        const output = createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 5 } });

        return new Promise((resolve) => {
            // 1. Listen for the 'close' event on the output stream (True completion)
            output.on('close', () => {
                resolve({ success: true, result: zipPath });
            });

            // 2. Handle errors from both the archiver and the write stream
            output.on('error', (err) => resolve({ success: false, error: err }));
            archive.on('error', (err) => resolve({ success: false, error: err }));

            // 3. Pipe and finalize
            archive.pipe(output);
            archive.directory(file, false);
            archive.finalize(); // No need to await this inside the Promise
        });
    }

    /**
     * Clears temp folders based on prefix and age.
     * @returns A list of error messages, if any occurred.
     */
    public static async clearTmpFolder(retentionDays: number): Promise<string[]> {
        const tmpFolder = FileManager.getTmpFolderPath();
        const tmpFolderPrefix = FileManager.tmpFolderPrefix;

        const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

        try {
            const files = await readdir(tmpFolder);
            // Map files to promises that return an error string or null
            const results = await Promise.all(files.map(async (file): Promise<string | null> => {
                if (!file.startsWith(tmpFolderPrefix)) return null;
                const filePath = path.join(tmpFolder, file);
                try {
                    const stats = await stat(filePath);

                    if (stats.mtimeMs < cutoff) {
                        await rm(filePath, { recursive: true, force: true });
                    }
                    return null; // Success
                } catch (err: any) {
                    // Return the formatted error string for this specific file
                    return `Path: ${filePath} | Error: ${err.message}`;
                }
            }));
            // Filter out the nulls to leave only the error strings
            return results.filter((result): result is string => result !== null);
        } catch (error: any) {
            // Handle top-level errors (like readdir failing)
            return [`Top-level directory error: ${error.message}`];
        }
    }
}