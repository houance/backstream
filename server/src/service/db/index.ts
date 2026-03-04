import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client';
import { logger } from '../log/logger'
import { env } from '../../config/env'

// This logic executes the SQL files in /drizzle folder
// It ensures tables exist before the app starts handling requests
migrate(db, { migrationsFolder: env.DRIZZLE_FOLDER });
logger.info("Database migrations applied successfully.");

export * from './client';
