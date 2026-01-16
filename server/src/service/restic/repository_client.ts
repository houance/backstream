import type {Repository} from '../db/schema.js';
import {execute} from "./utils.js";
import {ExitCode} from "./types.js";

export class RepositoryClient {
    private readonly _repository: Repository;
    private readonly _env: Record<string, string>;
    private _initialized = false;
    private _isLocked: boolean = false;

    private constructor(repository: Repository, createRepo?: boolean) {
        this._repository = repository;
        // convert config data to env
        this._env = {
            RESTIC_REPOSITORY: this._repository.configData.RESTIC_REPOSITORY,
            RESTIC_PASSWORD: this._repository.configData.RESTIC_PASSWORD,
        }
        if (this._repository.configData.certificate) {
            this._repository.configData.certificate.forEach((cert) => {
                Object.assign(this._env, cert)
            })
        }
    }

    public static async create(repository: Repository, createRepo?: boolean): Promise<RepositoryClient> {
        const client = new RepositoryClient(repository, createRepo);
        // inspect init status
        client._initialized = await client.isRepoExist();
        if (client._initialized) return client;
        // create repo as required
        if (createRepo) client._initialized = await client.createRepo();
        return client;
    }

    public isInitialized(): Readonly<boolean> {
        return this._initialized;
    }

    public getLockStatus(): Readonly<boolean> {
        return this._isLocked;
    }

    public getResticEnv(): Record<string, string> {
        return this._env;
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
}