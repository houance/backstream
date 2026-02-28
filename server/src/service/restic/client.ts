import {createTempDir, execute, executeStream, getParentPathFromNode, mapResticCode} from "./utils";
import {
    type CheckSummary,
    ExitCode, fail, type ForgetGroup,
    type Lock,
    type Node,
    type Progress,
    type RepoConfig, type ResticResult,
    type Snapshot, type SnapshotStat, type SnapshotSummary, success,
    type RepoStat,
    type Task,
} from "./types";
import {RepoType, type CertificateSchema, type RetentionPolicy} from "@backstream/shared"
import type {Result} from "execa";
import {join} from "node:path";
import camelcaseKeys from "camelcase-keys";

export class RepositoryClient {
    private readonly _env: Record<string, string>;
    public readonly repoType: RepoType;

    public constructor(path: string, password: string, repoType: RepoType, resticCert: CertificateSchema) {
        this.repoType = repoType;
        // convert config data to env
        this._env = {
            RESTIC_REPOSITORY: path,
            RESTIC_PASSWORD: password,
        }
        switch (repoType) {
            case "ALIYUN_OSS":
                this._env = {...this._env, ...resticCert?.oss};
                break;
            case "AWS_S3":
            case "S3":
                this._env = {...this._env, ...resticCert?.s3};
                break;
            case "BACKBLAZE_B2":
                this._env = {...this._env, ...resticCert?.b2};
                break;
            case "SFTP":
                this._env = {...this._env, ...resticCert?.sftp};
                break;
            default: break
        }
    }

    public static async checkIfResticInstall(): Promise<string> {
        const result = await execute(`restic version`, {});
        if (result.failed || mapResticCode(result.exitCode) !== ExitCode.Success) throw new Error(`restic version failed: ${result.stderr}`);
        return result.stdout as string;
    }

    public copyTo(
        targetClient: RepositoryClient,
        snapshotIds: string[],
        logFie:string,
        errorFile: string,
        uuid: string): Task<ResticResult<boolean>> {
        if (this.repoType !== RepoType.LOCAL && this.repoType === targetClient.repoType) {
            throw new Error('copy between same type of repositories is not supported');
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
        const progress: Progress = { percentDone: -1 };
        // 2. Process the stream in the background (Immediate Execution)
        (async () => {
            try {
                // Execa v9+ yields lines automatically from the subprocess
                for await (const line of process) {
                    // todo: regex from stdout, get process and snapshot id
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        })();
        // 处理结果
        const result = (async (): Promise<ResticResult<boolean>> => {
            const result:Result = await process;
            if (result.failed) return fail(result);
            return success(true, result);
        })();
        return {
            uuid:  uuid,
            command: command,
            logFile: logFie,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public backup(path: string, logFile: string, errorFile: string, uuid: string): Task<ResticResult<SnapshotSummary>> {
        const process = executeStream(
            `restic backup . --skip-if-unchanged --json`,
            logFile,
            errorFile,
            { cwd: path, env: this._env }
        );
        const progress: Progress = { totalBytes: 0, bytesDone: 0, percentDone: 0 };
        // 2. Process the stream in the background (Immediate Execution)
        let summary = '';
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
                        if (data.message_type === 'summary') {
                            summary = line.toString();
                        }
                    } catch {
                        /* Ignore non-JSON lines or partial chunks */
                    }
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        })();
        const result = (async (): Promise<ResticResult<SnapshotSummary>> => {
            const result:Result = await process;
            const exitCode = mapResticCode(result.exitCode);
            switch (exitCode) {
                case ExitCode.Success:
                case ExitCode.BackupReadError: {
                    return success(this.parse(summary, "{}"), result);
                }
                default: return fail(result);
            }
        })();
        return {
            uuid:  uuid,
            command: `restic backup ${path}(set as cwd) --skip-if-unchanged --json`,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public restore(
        snapshotId: string,
        node: Node,
        logFile: string,
        errorFile: string,
        uuid: string): Task<ResticResult<string>> {
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
            if (result.failed) return fail(result);
            return success(join(dir, node.name), result);
        })();
        return {
            uuid:  uuid,
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public prune(logFile: string, errorFile: string, uuid: string): Task<ResticResult<boolean>> {
        const command = this.repoType === "LOCAL" ?
            `restic prune --max-unused 0 --repack-cacheable-only --verbose` :
            `restic prune --max-unused unlimited --verbose`;
        const process = executeStream(
            command,
            logFile,
            errorFile,
            { env: this._env }
        );
        // 更新 progress
        const progress: Progress = { percentDone: -1 };
        // 2. Process the stream in the background (Immediate Execution)
        (async () => {
            try {
                // Execa v9+ yields lines automatically from the subprocess
                for await (const line of process) {
                    // todo: regex from stdout
                }
            } catch (err) {
                console.warn("Stream processing error:", err);
            }
        })();
        // 处理结果
        const result = (async (): Promise<ResticResult<boolean>> => {
            const result:Result = await process;
            if (result.failed) return fail(result);
            return success(true, result);
        })();
        return {
            uuid:  uuid,
            command: command,
            logFile: logFile,
            errorFile: errorFile,
            result: result,
            cancel: () => process.kill(),
            getProgress: () => progress,
        }
    }

    public check(
        logFile: string,
        errorFile: string,
        percentage:number = 0,
        uuid: string): Task<ResticResult<CheckSummary>> {
        const command = percentage > 0 ?
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
                console.warn("Stream processing error:", String(err));
            }
            const result:Result = await process;
            if (result.failed) return fail(result);
            try {
                return success(this.parse(lastLine, "{}"), result);
            } catch (e:any) {
                return fail(result, e);
            }
        })();
        return {
            uuid:  uuid,
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
        return result.failed ? fail(result) : success(true, result);
    }

    public async forgetByPathWithPolicy(
        path: string,
        retentionPolicy: RetentionPolicy,
        dryRun: boolean = false
    ): Promise<ResticResult<ForgetGroup[]>> {
        let retentionArg = '';
        switch (retentionPolicy.type) {
            case "count": {
                retentionArg = `--keep-${retentionPolicy.windowType} ${retentionPolicy.countValue}`
            } break;
            case "duration": {
                if (retentionPolicy.windowType !== 'last') {
                    retentionArg = `--keep-within-${retentionPolicy.windowType} ${retentionPolicy.durationValue}`
                } else {
                    retentionArg = `--keep-within ${retentionPolicy.durationValue}`
                }
            } break;
            case "tag": {
                retentionArg = `--keep-tag ${retentionPolicy.tagValue!.values()}`
            } break;
        }
        let command = `restic forget ${retentionArg} --path ${path} --json`
        if (dryRun) command += ` --dry-run`;
        const result = await execute(
            command,
            { env: this._env }
        );
        if (result.failed) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{[]}"), result);
        } catch (error: any) {
            return fail(result, error);
        }
    }

    public async getSnapshots(path?: string): Promise<ResticResult<Snapshot[]>> {
        const command = path ? `restic snapshots ${path} --json` : `restic snapshots --json`;
        const result = await execute(command, { env: this._env });
        if (result.failed) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "[]"), result);
        } catch (error:any) {
            return fail(result, error);
        }
    }

    public async getSnapshotFilesByPath(snapshotId: string, path: string='/', recursive: boolean=true): Promise<ResticResult<Node[]>> {
        const command = recursive ?
            `restic ls ${snapshotId} ${path} --recursive --json` :
            `restic ls ${snapshotId} ${path} --json` ;
        const result = await execute(command, { env: this._env });
        if (result.failed) return fail(result)
        let nodes: Node[] = [];
        try {
            const stdout: string = result.stdout as string
            stdout.split('\n').forEach((line) => {
                const trimLine: string = line.trim();
                const data: { message_type: string, path: string[] } = JSON.parse(trimLine);
                if (data.message_type === 'node') {
                    const node: Node = this.parse(trimLine, "{}")
                    if (node.path !== path) {
                        nodes.push(node);
                    }
                }
            })
        } catch (error:any) {
            return fail(result, error);
        }
        return success(nodes, result);
    }

    // restore-size(how much space it needs to restore snapshot to disk)
    public async getSnapshotSize(snapshotId: string): Promise<ResticResult<SnapshotStat>> {
        const result = await execute(`restic stats ${snapshotId} --mode restore-size --json`, { env: this._env });
        if (mapResticCode(result.exitCode) !== ExitCode.Success) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{}"), result);
        } catch (error:any) {
            return fail(result, error);
        }
    }

    public async getRepoSize(): Promise<ResticResult<RepoStat>> {
        const result = await execute(`restic stats --mode raw-data --json`, { env: this._env });
        if (mapResticCode(result.exitCode) !== ExitCode.Success) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{}"), result);
        } catch (error:any) {
            return fail(result, error);
        }
    }

    public async getRepoConfig(): Promise<ResticResult<RepoConfig>> {
        const result = await execute('restic cat config --json', { env: this._env });
        if (mapResticCode(result.exitCode) !== ExitCode.Success) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{}"), result);
        } catch (e:any) {
            return fail(result, e);
        }
    }

    public async isRepoExist(): Promise<ResticResult<boolean>> {
        const result = await execute('restic cat config', { env: this._env });
        const code:ExitCode = mapResticCode(result.exitCode)
        switch (code) {
            case ExitCode.Success: return success(true, result);
            case ExitCode.RepositoryDoesNotExist: return success(false, result);
            default: return fail(result);
        }
    }

    public async getRepoLock(): Promise<ResticResult<Lock>> {
        const listLockResult = await execute('restic list locks --no-lock --json', { env: this._env });
        const code = mapResticCode(listLockResult.exitCode)
        if (code !== ExitCode.Success) return fail(listLockResult);
        const lockId = listLockResult.stdout as string;
        if (lockId === "") return success({
            time: "",
            exclusive: false,
            hostname: "",
            username: "",
            pid: -1,
            uid: -1,
            gid: -1
        }, listLockResult)
        const catLockResult = await execute(`restic cat lock ${lockId} --no-lock --json`, { env: this._env });
        const catLockCode = mapResticCode(catLockResult.exitCode)
        if (catLockCode !== ExitCode.Success) return fail(catLockResult);
        try {
            return success(this.parse(catLockResult.stdout as string, "{}"), catLockResult);
        } catch (e:any) {
            return fail(catLockResult, e);
        }
    }

    public async createRepo(): Promise<ResticResult<boolean>> {
        const result = await execute(`restic init`, { env: this._env });
        return mapResticCode(result.exitCode) === ExitCode.Success ? success(true, result) : fail(result);
    }

    public async createRepoWithSameChunker(fromClient: RepositoryClient): Promise<ResticResult<boolean>> {
        if (this.repoType !== RepoType.LOCAL && this.repoType === fromClient.repoType) {
            throw new Error('init repository from same type is not supported');
        }
        const command = `restic init --copy-chunker-params`;
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
        return mapResticCode(result.exitCode) === ExitCode.Success ? success(true, result) : fail(result);
    }

    /**
     * Parses stdout or a fallback string into JSON, then camelCases the keys.
     * Throws an error if the resulting string is not valid JSON.
     */
    private parse<T>(stdout: string, fallbackJson: string): T {
        // Use stdout if it exists, otherwise use the fallback string
        const payload = stdout.trim() === "" ? fallbackJson : stdout;

        // Parse the JSON (will throw naturally if payload is invalid)
        const snakeCaseResult = JSON.parse(payload);

        // Convert keys and return as the generic type
        return camelcaseKeys(snakeCaseResult, { deep: true }) as unknown as T;
    }
}