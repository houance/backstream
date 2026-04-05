import {existsSync, constants} from "node:fs";
import {mkdtemp, writeFile, readdir, stat, rm, mkdir, realpath, access, unlink} from "node:fs/promises";
import path from "node:path";
import { env } from '../../config/env'
import {logger} from "../log/logger";

export class FileManager {
    public static baseTmpDir = env.TMP_FOLDER;
    private static tmpFolderPrefix = "backstream-";

    public static async getTmpFolderPath(): Promise<string> {
        if (!existsSync(FileManager.baseTmpDir)) {
            await mkdir(FileManager.baseTmpDir, { recursive: true });
        }
        return FileManager.baseTmpDir;
    }

    public static async createTmpFolder() {
        // 1. Determine Root (Default to system temp)
        const root = await FileManager.getTmpFolderPath();
        // create random folder with six figure suffix
        return await mkdtemp(path.join(root, FileManager.tmpFolderPrefix));
    }

    public static async createLogFile() {
        const logFolder = await FileManager.createTmpFolder();
        // 3. Create Files
        const logFile = path.join(logFolder, `stdout.log`);
        await writeFile(logFile, '');

        return logFile
    }

    // join zip path from tmp folder, no create
    public static async getZipFilePath(name: string) {
        let fileFullName = name;
        if (!name.endsWith(".zip")) fileFullName = name + ".zip";
        const zipFolder = await FileManager.createTmpFolder();
        return path.join(zipFolder, fileFullName);
    }

    public static async getFileInfo(fullPath: string) {
        const stats = await stat(fullPath);
        const fileName = path.basename(fullPath);

        // path.extname returns '.ext', slice(1) removes the leading dot
        const fileType = path.extname(fullPath).slice(1).toLowerCase();

        return {
            size: stats.size,
            name: fileName,
            type: fileType
        };
    }

    public static async deleteFileAndFolder(fullPath: string) {
        try {
            // 1. Delete the file (it must be a file)
            await unlink(fullPath);
            // 2. Identify the parent folder
            const parentFolder = path.dirname(fullPath);
            const folderName = path.basename(parentFolder);
            // 3. Delete the parent folder only if it starts with tmp folder prefix
            if (folderName.startsWith(FileManager.tmpFolderPrefix)) {
                // Use recursive: true if the folder might contain other files/folders
                await rm(parentFolder, { recursive: true, force: true });
            }
        } catch (error: any) {
            logger.error(`Failed to delete: ${error.message}`);
        }
    }

    /**
     * Clears temp folders based on prefix and age.
     * @returns A list of error messages, if any occurred.
     */
    public static async clearTmpFolder(retentionDays: number): Promise<string[]> {
        const tmpFolder = await FileManager.getTmpFolderPath();
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

    public static async getExistingDevId(targetPath: string): Promise<number> {
        const absolutePath = path.resolve(targetPath);

        try {
            // Check if path exists and is accessible
            await access(absolutePath, constants.F_OK);
            // Get real path (resolves symlinks) and its device ID
            const realPath = await realpath(absolutePath);
            const stats = await stat(realPath);
            return stats.dev;
        } catch (error: any) {
            // If path doesn't exist (ENOENT), try the parent directory
            if (error.code === 'ENOENT') {
                const parent = path.dirname(absolutePath);
                if (parent === absolutePath) {
                    throw new Error(`Root reached: could not find existing parent for ${targetPath}`);
                }
                return FileManager.getExistingDevId(parent);
            }
            throw error;
        }
    }

    public static async isSameDrive(dataSource: string, repoPath: string): Promise<boolean> {
        try {
            // Run both checks in parallel for better performance
            const [dev1, dev2] = await Promise.all([
                FileManager.getExistingDevId(dataSource),
                FileManager.getExistingDevId(repoPath)
            ]);
            return dev1 === dev2;
        } catch (error) {
            logger.error(error, `Error comparing drives.`);
            return false;
        }
    }
}