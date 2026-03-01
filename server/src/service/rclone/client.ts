import {type About, fail, RcloneExitCode, type RcloneResult, type Size, success} from "./types";
import camelcaseKeys from "camelcase-keys";
import {execute} from "./utils";

export class RcloneClient {
    private readonly remote: string;
    private readonly _env: Record<string, string>;

    public constructor(remoteName?: string) {
        this._env = process.env.RCLONE_CONFIG
            ? {RCLONE_CONFIG: process.env.RCLONE_CONFIG }
            : {}
        if (!remoteName || remoteName.trim() === '') {
            this.remote = ''; // Local mode
        } else {
            // Ensure remote ends with exactly one colon
            this.remote = remoteName.endsWith(':') ? remoteName : `${remoteName}:`;
        }
    }

    public static async checkIfRcloneInstall(): Promise<RcloneResult<string>> {
        const result = await execute(`rclone --version`, {});
        if (result.failed || result.exitCode !== RcloneExitCode.SUCCESS) return fail(result);
        return success(result.stdout as string, result);
    }

    public async getSize(path: string): Promise<RcloneResult<Size>> {
        const fullPath = `${this.remote}${path}`;
        const result = await execute(`rclone size ${fullPath} --json`, {env: this._env});
        if (result.failed || result.exitCode !== RcloneExitCode.SUCCESS) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{}"), result);
        } catch (e) {
            return fail(result, e);
        }
    }

    public async getBackendStat(path?: string): Promise<RcloneResult<About>> {
        const fullPath = path
            ? `${this.remote}${path}`
            : this.remote
        const result = await execute(`rclone about ${fullPath} --json`, {env: this._env});
        if (result.failed || result.exitCode !== RcloneExitCode.SUCCESS) return fail(result);
        try {
            return success(this.parse(result.stdout as string, "{}"), result);
        } catch (e) {
            return fail(result, e);
        }
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
