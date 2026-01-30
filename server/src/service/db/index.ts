import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client';

// This logic executes the SQL files in /drizzle folder
// It ensures tables exist before the app starts handling requests
try {
    migrate(db, { migrationsFolder: './drizzle' });
    console.log("Database migrations applied successfully.");
} catch (error) {
    console.error("Migration failed:", error);
}

export * from './client';
export * from './schema';
