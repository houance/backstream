import type {Repository} from '../db/schema.js';
import {ExitCode, type ResticEnv, type ResticResult} from './types.js'
import {execa, type Result, type Subprocess} from "execa";
import {parseExitCodeFromResult} from "./utils.js";

export class RepositoryClient {
    private _repository: Repository;
    private _isLocked: boolean = false;
    private _childProcess: Subprocess | null = null;
    private _abortController: AbortController | null = null;

    constructor(repository: Repository) {
        this._repository = repository;
    }

    public getLockStatus(): Readonly<boolean> {
        return this._isLocked;
    }

    public getResticEnv(): Readonly<ResticEnv> {
        return this._repository.configData;
    }

    public async init(): Promise<ResticResult> {
        const result: Result = await execa('restic', {
            env: {

            },
            reject: false
        })
        if (result.failed) {
            return {
                success: false,
                exitCode: parseExitCodeFromResult(result.exitCode),
                stderr: typeof result.stderr === 'string' ? result.stderr : ""
            }
        } else {
            return {
                success: true,
                exitCode: ExitCode.Success
            }
        }
    }
}