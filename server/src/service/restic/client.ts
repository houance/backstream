import {createTempDir, execute, executeStream, getParentPathFromNode, mapResticCode} from "./utils.js";
import {
    type CheckSummary,
    ExitCode,
    type Node,
    type Progress,
    type RepoConfig,
    RepoType,
    type ResticEnv,
    ResticResult,
    type Snapshot,
    type Task,
} from "./types.js";
import type {Result} from "execa";
import {join} from "node:path";

export class RepositoryClient {
    private readonly _env: Record<string, string>;
    public readonly repoType: RepoType;

    private constructor(resticEnv: ResticEnv, repoType: RepoType) {
        this.repoType = repoType;
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

    public static async create(resticEnv: ResticEnv, repoType: RepoType, createRepo?: boolean): Promise<RepositoryClient> {
        const client = new RepositoryClient(resticEnv, repoType);
        // Try to create if requested
        if (createRepo) await client.createRepo();
        return client;
    }

    public copyTo(
        targetClient: RepositoryClient,
        snapshotIds: string[],
        logFie:string,
        errorFile: string): Task<ResticResult<boolean>> {
        if (this.repoType !== RepoType.LOCAL && this.repoType === targetClient.repoType) {
            throw new Error('copying between two remote repositories is not supported');
        }
        const command = `restic copy ${snapshotIds.join(' ')}`;
        const process = executeStream(
            command,
            logFie,
            errorFile,
            {
                env: {
                    ...this._env,
                    ...targetClient._env,
                    RESTIC_REPOSITORY: targetClient._env.RESTIC_REPOSITORY,
                    RESTIC_PASSWORD: targetClient._env.RESTIC_PASSWORD,
                    RESTIC_FROM_REPOSITORY: this._env.RESTIC_REPOSITORY,
                    RESTIC_FROM_PASSWORD: this._env.RESTIC_PASSWORD,
                }
            }
        )
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
        const result = (async (): Promise<ResticResult<boolean>> => {
            const result:Result = await process;
            if (result.failed) return ResticResult.error(result);
            return ResticResult.ok(result, true);
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFie,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public backup(path: string, logFile: string, errorFile: string): Task<ResticResult<ExitCode>> {
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
        const result = (async (): Promise<ResticResult<ExitCode>> => {
            const result:Result = await process;
            const exitCode = mapResticCode(result.exitCode);
            switch (exitCode) {
                case ExitCode.Success:
                case ExitCode.BackupReadError: return ResticResult.ok(result, exitCode);
                default: return ResticResult.error(result);
            }
        })();
        return {
            uuid: crypto.randomUUID(),
            command: `restic backup ${path}(set as cwd) --skip-if-unchanged --json`,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public restore(snapshotId: string, node: Node, logFile: string, errorFile: string): Task<ResticResult<string>> {
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
        const result = (async (): Promise<ResticResult<string>> => {
            const result:Result = await process;
            if (result.failed) return ResticResult.error(result);
            return ResticResult.ok(result, join(dir, node.name));
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public prune(type: 'local' | 'cloud', logFile: string, errorFile: string): Task<ResticResult<boolean>> {
        const command = type === "local" ?
            `restic prune --max-unused 0 --repack-cacheable-only --verbose` :
            `restic prune --max-unused unlimited --verbose`;
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
        const result = (async (): Promise<ResticResult<boolean>> => {
            const result:Result = await process;
            if (result.failed) return ResticResult.error(result);
            return ResticResult.ok(result, true);
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public check(logFile: string, errorFile: string, percentage?:number): Task<ResticResult<CheckSummary>> {
        const command = percentage ?
            `restic check --read-data-subset=${percentage}% --json` :
            `restic check --json`
        const process = executeStream(
            command,
            logFile,
            errorFile,
            { env: this._env }
        );
        // 不支持 progress
        const progress: Progress = { percentDone: -1 };
        // 处理结果
        const result = (async (): Promise<ResticResult<CheckSummary>> => {
            let lastLine:string = "";
            try {
                for await (const line of process) {
                    lastLine = line as string;
                }
            } catch (err) {
                lastLine = err instanceof Error ? err.message : String(err);
            }
            const result:Result = await process;
            if (result.failed) return ResticResult.error(result);
            try {
                return ResticResult.ok(result, JSON.parse(lastLine));
            } catch (e:any) {
                return ResticResult.parseError(result, e);
            }
        })();
        return {
            uuid: crypto.randomUUID(),
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public async forgetBySnapId(snapshotId: string): Promise<ResticResult<boolean>> {
        const result = await execute(`restic forget ${snapshotId} --json`, { env: this._env });
        return result.failed ?
            ResticResult.error(result) :
            ResticResult.ok(result, true);
    }

    public async getSnapshotsByPath(path: string): Promise<ResticResult<Snapshot[]>> {
        const result = await execute(`restic snapshots --path ${path} --json`, { env: this._env });
        if (result.failed) return ResticResult.error(result);
        try {
            const snapshots:Snapshot[] = JSON.parse(result.stdout as string)
            return ResticResult.ok(result, snapshots);
        } catch (error:any) {
            return ResticResult.parseError(result, error);
        }
    }

    public async getSnapshotFilesByPath(snapshotId: string, path: string='/'): Promise<ResticResult<Node[]>> {
        const result = await execute(`restic ls ${snapshotId} ${path} --json`, { env: this._env });
        if (result.failed) return ResticResult.error(result)
        let nodes: Node[] = [];
        try {
            const stdout: string = result.stdout as string
            stdout.split('\n').forEach((line) => {
                const trimLine: string = line.trim();
                const data: { message_type: string, path: string[] } = JSON.parse(trimLine);
                if (data.message_type === 'node') {
                    const node: Node = JSON.parse(trimLine);
                    if (node.path !== path) {
                        nodes.push(node);
                    }
                }
            })
        } catch (error:any) {
            return ResticResult.parseError(result, error);
        }
        return ResticResult.ok(result, nodes);
    }

    public async getRepoConfig(): Promise<ResticResult<RepoConfig>> {
        const result = await execute('restic cat config', { env: this._env });
        switch (mapResticCode(result.exitCode)) {
            case ExitCode.Success:
                try {
                    const repoConfig:RepoConfig = JSON.parse(result.stdout as string)
                    return ResticResult.ok(result, repoConfig);
                } catch (e:any) {
                    return ResticResult.parseError(result, e);
                }
            default: return ResticResult.error(result);
        }
    }

    public async isRepoExist(): Promise<ResticResult<boolean>> {
        const result = await execute('restic cat config', { env: this._env });
        switch (mapResticCode(result.exitCode)) {
            case ExitCode.Success: return ResticResult.ok(result, true);
            case ExitCode.RepositoryDoesNotExist: return ResticResult.ok(result, false);
            default: return ResticResult.error(result);
        }
    }

    public async createRepo(): Promise<ResticResult<boolean>> {
        const initResult = await this.isRepoExist();
        if (!initResult.success) return initResult; // cat config 失败
        if (initResult.result) return initResult; // cat config 成功且 repo 已初始化
        const result = await execute(`restic init`, { env: this._env });
        return mapResticCode(result.exitCode) === ExitCode.Success ?
            ResticResult.ok(result, true) :
            ResticResult.error(result);
    }

    public async createRepoWithSameChunker(fromClient: RepositoryClient): Promise<ResticResult<boolean>> {
        if (this.repoType !== RepoType.LOCAL && this.repoType === fromClient.repoType) {
            throw new Error('init repository from same type is not supported');
        }
        // todo: fromClient 没有初始化
        const repoExistResult = await this.isRepoExist();
        if (!repoExistResult.success || repoExistResult.result) { // cat config 失败, 或仓库已经初始化
            return ResticResult.error(repoExistResult.rawExecResult)
        }
        // todo: from client 已初始化
        const command = `restic init --copy-chunker-param`;
        const result = await execute(
            command,
            {
                env: {
                    ...this._env,
                    ...fromClient._env,
                    RESTIC_REPOSITORY: this._env.RESTIC_REPOSITORY,
                    RESTIC_PASSWORD: this._env.RESTIC_PASSWORD,
                    RESTIC_FROM_REPOSITORY: fromClient._env.RESTIC_REPOSITORY,
                    RESTIC_FROM_PASSWORD: fromClient._env.RESTIC_PASSWORD,
                }
            }
        )
        return mapResticCode(result.exitCode) === ExitCode.Success ?
            ResticResult.ok(result, true) :
            ResticResult.error(result);
    }
}