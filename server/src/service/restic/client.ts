import {execute} from "./utils.js";
import {
    ExitCode,
    type ResticEnv,
    type Snapshot,
    type Node
} from "./types.js";

export class RepositoryClient {
    private readonly _env: Record<string, string>;
    private _initialized = false;

    private constructor(resticEnv: ResticEnv, createRepo?: boolean) {
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
        const client = new RepositoryClient(resticEnv, createRepo);
        // inspect init status
        client._initialized = await client.isRepoExist();
        if (client._initialized) return client;
        // create repo as required
        if (createRepo) client._initialized = await client.createRepo();
        return client;
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

    public async createRepo(): Promise<boolean> {
        if (this._initialized) return true;
        const result = await execute(`restic init`, { env: this._env });
        if (result.success) {
            this._initialized = true
            return true
        }
        throw new Error(
            `Restic init failed (Exit Code: ${result.exitCode}): ${result.stderr || 'Unknown error'}`
        );
    }

    public isInitialized(): Readonly<boolean> {
        return this._initialized;
    }
}