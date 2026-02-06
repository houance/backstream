import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import {schema} from '@backstream/shared';

// Creates the sqlite file if it doesn't exist
const sqlite = new Database('./db/backstream_app.db');

// Export the singleton instance
export const db = drizzle(sqlite, { schema, logger:true });
