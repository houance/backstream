import {createTempDir, execute, executeStream, getParentPathFromNode, parseExitCodeFromResult} from "./utils.js";
import {
    ExitCode,
    type Node,
    type Progress,
    type ResticEnv,
    type Snapshot,
    type Task
} from "./types.js";
import type {Result} from "execa";
import {join} from "node:path";

export class RepositoryClient {
    private readonly _env: Record<string, string>;
    private _initialized = false;

    private constructor(resticEnv: ResticEnv) {
        // convert config data to env
        this._env = {
            RESTIC_REPOSITORY: resticEnv.RESTIC_REPOSITORY,
            RESTIC_PASSWORD: resticEnv.RESTIC_PASSWORD,
        }
        if (resticEnv.certificate) {
            resticEnv.certificate.forEach((cert) => {
                Object.assign(this._env, cert)
            })
        }
    }

    public static async create(resticEnv: ResticEnv, createRepo?: boolean): Promise<RepositoryClient> {
        const client = new RepositoryClient(resticEnv);
        // Check if it exists first
        const exists = await client.isRepoExist();
        if (exists) {
            client._initialized = true;
            return client; // Early exit 1
        }
        // Try to create if requested
        if (createRepo) {
            await client.createRepo();
            client._initialized = true;
        }
        return client;
    }

    public backup(path: string, logFile: string, errorFile: string): Task {
        const process = executeStream(
            `restic backup . --skip-if-unchanged --json`,
            logFile,
            errorFile,
            { cwd: path, env: this._env }
        );
        const progress: Progress = { totalBytes: 0, bytesDone: 0, percentDone: 0 };
        // 2. Process the stream in the background (Immediate Execution)
        // We don't 'await' this here so we can return the Task immediately
        (async () => {
            try {
                // Execa v9+ yields lines automatically from the subprocess
                for await (const line of process) {
                    try {
                        const data:{
                            message_type: string,
                            percent_done: number,
                            total_bytes: number,
                            bytes_done: number
                        } = JSON.parse(line.toString());
                        // Restic specific JSON logic (adjust based on actual restic output)
                        if (data.message_type === 'status') {
                            progress.totalBytes = data.total_bytes;
                            progress.bytesDone = data.bytes_done;
                            progress.percentDone = data.percent_done;
                        }
                    } catch {
                        /* Ignore non-JSON lines or partial chunks */
                    }
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        })();
        const exitCode = (async (): Promise<ExitCode> => {
            const result:Result = await process;
            return parseExitCodeFromResult(result.exitCode)
        })();
        return {
            uuid: crypto.randomUUID(),
            command: `restic backup ${path}(set as cwd) --skip-if-unchanged --json`,
            logFile: logFile,
            errorFile: errorFile,
            getResult: () => exitCode,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public restore(snapshotId: string, node: Node, logFile: string, errorFile: string): Task {
        const dir = createTempDir();
        const command = `restic restore ${snapshotId}:${getParentPathFromNode(node)} ` +
            `--target ${dir} --include /${node.name} --json`
        const process = executeStream(
            command,
            logFile,
            errorFile,
            { env: this._env }
        );
        // 更新 progress
        const progress: Progress = { totalBytes: 0, bytesDone: 0, percentDone: 0 };
        // 2. Process the stream in the background (Immediate Execution)
        (async () => {
            try {
                // Execa v9+ yields lines automatically from the subprocess
                for await (const line of process) {
                    try {
                        const data: {
                            message_type: string,
                            percent_done: number,
                            total_bytes: number,
                            bytes_restored: number
                        } = JSON.parse(line.toString());
                        // Restic specific JSON logic (adjust based on actual restic output)
                        if (data.message_type === 'status') {
                            progress.totalBytes = data.total_bytes;
                            progress.bytesDone = data.bytes_restored;
                            progress.percentDone = data.percent_done;
                        }
                    } catch {
                        /* Ignore non-JSON lines or partial chunks */
                    }
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        })();
        // 处理结果
        const restoreFile = join(dir, node.name)
        const exitCode = (async (): Promise<ExitCode> => {
            const result:Result = await process;
            return parseExitCodeFromResult(result.exitCode)
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            getResult: () => exitCode,
            cancel: () => process.kill(),
            getProgress: () => progress,
            restoreFile: restoreFile,
        }
    }

    public prune(type: 'local' | 'cloud', logFile: string, errorFile: string): Task {
        const command = type === "local" ?
            `restic prune --max-unused 0 --repack-cacheable-only --verbose --retry-lock 10s` :
            `restic prune --max-unused unlimited --verbose --retry-lock 10s`;
        const process = executeStream(
            command,
            logFile,
            errorFile,
            { env: this._env }
        );
        // 更新 progress
        const progress: Progress = { totalBytes: 0, bytesDone: 0, percentDone: 0 };
        // 2. Process the stream in the background (Immediate Execution)
        (async () => {
            try {
                // Execa v9+ yields lines automatically from the subprocess
                for await (const line of process) {
                    // todo: regex from stdout
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        })();
        // 处理结果
        const exitCode = (async (): Promise<ExitCode> => {
            const result:Result = await process;
            return parseExitCodeFromResult(result.exitCode)
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            getResult: () => exitCode,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public async deleteSnapshot(snapshotId: string): Promise<void> {
        const result = await execute(`restic forget ${snapshotId} --json --retry-lock 5s`, { env: this._env });
        if (!result.success) throw new Error(
            `Restic snapshots failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
    }

    public async getSnapshotsByPath(path: string): Promise<Snapshot[]> {
        const result = await execute(`restic snapshots --path ${path} --json`, { env: this._env });
        if (!result.success) throw new Error(
            `Restic snapshots failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
        if (result.stdout === '') return [];
        return JSON.parse(result.stdout);
    }

    public async getSnapshotFilesByPath(snapshotId: string, path: string='/'): Promise<Node[]> {
        const result = await execute(`restic ls ${snapshotId} ${path} --json`, { env: this._env });
        if (!result.success) throw new Error(
            `Restic ls failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
        if (result.stdout === '') return [];
        let nodes: Node[] = [];
        result.stdout.split('\n').forEach((line) => {
            const trimLine: string = line.trim();
            const data: { message_type: string, path: string[] } = JSON.parse(trimLine);
            if (data.message_type === 'node') {
                const node: Node = JSON.parse(trimLine);
                if (node.path !== path) {
                    nodes.push(node);
                }
            }
        })
        return nodes;
    }

    private async isRepoExist(): Promise<boolean> {
        const result = await execute('restic cat config', { env: this._env });
        if (result.success) {
            return true;
        }
        if (result.exitCode === ExitCode.RepositoryDoesNotExist) {
            return false;
        }
        throw new Error(
            `Restic cat config failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
    }

    public async createRepo(): Promise<void> {
        if (this._initialized) return;
        const result = await execute(`restic init`, { env: this._env });
        if (result.success) {
            this._initialized = true
            return;
        }
        throw new Error(
            `Restic init failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
    }

    public isInitialized(): Readonly<boolean> {
        return this._initialized;
    }
}