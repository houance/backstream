import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client';
import { logger } from '../log/logger'

// This logic executes the SQL files in /drizzle folder
// It ensures tables exist before the app starts handling requests
migrate(db, { migrationsFolder: './drizzle' });
logger.info("Database migrations applied successfully.");

export * from './client';
