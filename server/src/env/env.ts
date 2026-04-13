import { z } from 'zod';
import path from "node:path";

const envSchema = z.object({
    // Define the allowed modes
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // work at production,
    PORT: z.string().default('3000').transform(Number),
    // Strict enum for logging
    LOG_LEVEL: z.string()
        .toLowerCase()
        .pipe(z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']))
        .default('info'),
    LOG_FOLDER: z.string().default(path.resolve(import.meta.dirname, '..', '..', 'log')),
    TMP_FOLDER: z.string().default(path.resolve(import.meta.dirname, '..', '..', 'audit_restic')),
    SQLITE_FOLDER: z.string().default(path.resolve(import.meta.dirname, '..', '..', 'db')),
    DRIZZLE_FOLDER: z.string().default(path.resolve(import.meta.dirname, '..', '..', 'drizzle')),
});

// Run the validation
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    // Extract just the error messages into a single string
    const errorMessages = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n   ');

    throw new Error(`❌ Invalid Environment Variables:\n   ${errorMessages}`);
}

export const env = parsed.data;
