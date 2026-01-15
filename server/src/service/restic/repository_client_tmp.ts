import { execa } from 'execa';
import { Readable } from 'stream';
import type {Repository} from '../db/schema.js';

const RESTIC_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface ResticCommandResult {
    stdout: string | Readable;
    stderr: string | Readable;
    exitCode: number | null;
    exitMessage: string;
}

export class RepositoryClient {
    private _repository: Repository;
    private _isLocked: boolean = false;
    private _childProcess: ExecaChildProcess | null = null;
    private _abortController: AbortController | null = null;

    constructor(repository: Repository) {
        this._repository = repository;
    }

    public getLockStatus(): Readonly<boolean> {
        return this._isLocked;
    }

    public cancelLongRunningJob(): void {
        if (this._abortController) {
            console.log(`Sending abort signal to Restic process.`);
            this._abortController.abort();
            this._abortController = null;
            this._isLocked = false;
            this._childProcess = null; // Clear the reference
        } else if (this._childProcess) {
            // Fallback for cases where abortController might not be set, but process exists
            console.log(`No AbortController, sending SIGTERM to Restic process (PID: ${this._childProcess.pid})`);
            this._childProcess.kill('SIGTERM');
            this._isLocked = false;
            this._childProcess = null;
        }
    }

    public getRepoConnectionParams(): string {
        // In the provided schema, 'name' is a text field. If it's meant to store the repository path,
        // then this is correct. Otherwise, a 'path' field would be more appropriate in the schema.
        // For now, assuming 'name' holds the repository path.
        return `-r ${this._repository.name}`;
    }

    private async _executeResticCommand(
        commandArgs: string[],
        streaming: boolean,
        requireLock: boolean,
        timeoutMs: number | null = null
    ): Promise<ResticCommandResult> {
        if (requireLock && this._isLocked) {
            return {
                stdout: '',
                stderr: 'Repository is already locked by another operation.',
                exitCode: 1,
                exitMessage: 'Repository locked.',
            };
        }

        this._isLocked = requireLock;
        this._abortController = new AbortController();
        let exitCode: number | null = null;
        let exitMessage: string = 'Unknown error.';

        try {
            const repoConnectionParams = this.getRepoConnectionParams().split(' ');
            const fullCommandArgs = [...repoConnectionParams, ...commandArgs];

            const execaOptions: any = {
                all: true, // Combine stdout and stderr for easier error logging if not streaming
                env: { ...process.env }, // Start with process.env
                reject: false, // Do not throw on non-zero exit code, we handle it manually
                signal: this._abortController.signal, // Link abort controller for cancellation
            };

            // Set environment variables from configData
            if (this._repository.configData) {
                try {
                    const config = JSON.parse(this._repository.configData);
                    // Merge config into execaOptions.env
                    for (const key in config) {
                        if (Object.prototype.hasOwnProperty.call(config, key)) {
                            execaOptions.env[key] = config[key];
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse configData:', e);
                    // Continue without setting configData env vars if parsing fails
                }
            }

            if (timeoutMs) {
                // execa's signal combined with AbortController handles timeout cancellation
                const timeoutId = setTimeout(() => {
                    if (this._abortController && !this._abortController.signal.aborted) {
                        console.warn(`Restic process timed out after ${timeoutMs}ms. Aborting.`);
                        this._abortController.abort();
                        exitMessage = `Restic command timed out after ${timeoutMs / 1000 / 60} minutes.`;
                    }
                }, timeoutMs);
                this._abortController.signal.addEventListener('abort', () => clearTimeout(timeoutId));
            }

            console.log(`Executing restic command: restic ${fullCommandArgs.join(' ')}`);
            this._childProcess = execa('restic', fullCommandArgs, execaOptions);

            if (streaming) {
                return {
                    stdout: this._childProcess.stdout || new Readable(), // Ensure a Readable stream is returned
                    stderr: this._childProcess.stderr || new Readable(), // Ensure a Readable stream is returned
                    exitCode: null, // Will be set on 'close' event of the process
                    exitMessage: 'Command running (streaming output).',
                };
            } else {
                const { stdout, stderr, exitCode: code, failed, signal, isCanceled } = await this._childProcess;
                exitCode = code;

                if (isCanceled) {
                    exitMessage = 'Restic command cancelled.';
                } else if (failed) {
                    exitMessage = stderr || stdout || `Restic command failed with exit code ${exitCode}.`;
                    if (exitCode === 1) exitMessage = stderr || stdout || 'Restic command failed due to a fatal error.';
                    else if (exitCode === 3) exitMessage = stderr || stdout || 'Restic command finished with warnings.';
                } else if (signal === 'SIGKILL') {
                    exitMessage = `Restic command terminated by SIGKILL (likely due to timeout).`;
                } else if (signal === 'SIGTERM') {
                    exitMessage = `Restic command terminated by SIGTERM (likely due to cancellation).`;
                } else {
                    exitMessage = 'Restic command executed successfully.';
                }

                return {
                    stdout: stdout,
                    stderr: stderr,
                    exitCode,
                    exitMessage,
                };
            }
        } catch (error: any) {
            exitCode = error.exitCode || 1;
            exitMessage = `Error executing restic command: ${error.message}`;
            console.error('Restic command execution error:', error);
            return {
                stdout: '',
                stderr: error.stderr || error.message,
                exitCode,
                exitMessage,
            };
        } finally {
            // For non-streaming, the lock is released after the promise resolves
            // For streaming, the consumer is responsible for handling the end of streams and potentially lock release
            // For now, let's assume the streaming consumer will notify for lock release
            if (!streaming && requireLock) {
                this._isLocked = false;
            }
            this._childProcess = null;
            this._abortController = null;
        }
    }

    public async init(): Promise<ResticCommandResult> {
        return this._executeResticCommand(['init'], false, true);
    }

    public async check(): Promise<ResticCommandResult> {
        // For streaming commands, the lock must be released by the consumer after streams close
        const result = await this._executeResticCommand(['check'], true, true, RESTIC_TIMEOUT_MS);
        if (result.stdout instanceof Readable) {
            // Listen for stream close to release lock for long-running streaming commands
            result.stdout.on('close', () => { this._isLocked = false; });
            result.stderr.on('close', () => { this._isLocked = false; });
        } else if (result.exitCode !== null) {
            this._isLocked = false;
        }
        return result;
    }

    public async prune(): Promise<ResticCommandResult> {
        // For streaming commands, the lock must be released by the consumer after streams close
        const result = await this._executeResticCommand(['prune'], true, true, RESTIC_TIMEOUT_MS);
        if (result.stdout instanceof Readable) {
            // Listen for stream close to release lock for long-running streaming commands
            result.stdout.on('close', () => { this._isLocked = false; });
            result.stderr.on('close', () => { this._isLocked = false; });
        } else if (result.exitCode !== null) {
            this._isLocked = false;
        }
        return result;
    }

    public async cat(type: 'config' | 'snapshot' | string, id?: string): Promise<ResticCommandResult> {
        const commandArgs = ['cat', type];
        if (id) {
            commandArgs.push(id);
        }
        return this._executeResticCommand(commandArgs, false, false);
    }
}
