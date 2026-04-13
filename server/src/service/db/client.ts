import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {Logger} from 'drizzle-orm/logger';
import Database from 'better-sqlite3';
import {schema} from '@backstream/shared';
import { env } from '../../env/env'
import path from "node:path";
import { logger } from '../log/logger';

class DrizzleLogger implements Logger {
    logQuery(query: string, params: unknown[]): void {
        // We use 'debug' level so it doesn't clutter prod unless LOG_LEVEL is set low
        logger.debug({
            sql: query,
            params
        }, 'Drizzle Query');
    }
}

// Creates the sqlite file if it doesn't exist
const sqlite = new Database(path.resolve(env.SQLITE_FOLDER, 'backstream_app.db'));

// Export the singleton instance
export const db = drizzle(sqlite, { schema });
