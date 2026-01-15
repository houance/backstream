import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

// Creates the sqlite file if it doesn't exist
const sqlite = new Database('backup_app.db');

// Export the singleton instance
export const db = drizzle(sqlite, { schema });
