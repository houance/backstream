import { Hono } from 'hono'
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import infoRoute from './routes/info'
import storageRoute from "./routes/storage";
import policyRoute from "./routes/policy";
import settingRoute from "./routes/setting";
import snapshotRoute from "./routes/snapshots";
import restoreRoute from "./routes/restore";
import { db } from './service/db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {Scheduler} from "./service/backup-manager/scheduler";
import {RepositoryClient} from "./service/restic";
import {RcloneClient} from "./service/rclone";
import { pinoLogger } from 'hono-pino'
import { logger } from './service/log/logger'
import { env } from './config/env'

// check restic installation
logger.info(await RepositoryClient.checkIfResticInstall())
// check rclone installation
logger.info(await RcloneClient.checkIfRcloneInstall())

export type Env = {
  Variables: {
    db: typeof db;
    scheduler: Scheduler;
    logger: typeof logger;
  };
};
// init scheduler once
const scheduler = await Scheduler.create(5)

const app = new Hono<Env>();

app.use('*', pinoLogger({ pino: logger }))
app.use('*', async (c, next) => {
  c.set('db', db);
  c.set('scheduler', scheduler);
  await next();
});

// Get absolute path to the current file's directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serve static files ONLY in production
if (env.NODE_ENV === 'production') {
  // Use absolute paths to avoid CWD confusion
  const staticPath = path.resolve(__dirname, '../../web/dist');

  app.use('/*', serveStatic({ root: staticPath }));
  app.get('*', serveStatic({ path: path.join(staticPath, 'index.html') }));
}

// Define prefix for all data routes
const routes = app.basePath('/api')
    .route('/info', infoRoute)
    .route('/storage', storageRoute)
    .route('/policy', policyRoute)
    .route('/setting', settingRoute)
    .route('/snapshot', snapshotRoute)
    .route('/restore', restoreRoute)

// Export the AppType for the frontend
export type AppType = typeof routes

if (env.NODE_ENV === 'production') {
  serve({
    fetch: app.fetch,
    port: env.PORT,
    hostname: '0.0.0.0',
  }, (info) => {
    logger.info(`Server is running on http://${info.address}:${info.port}`)
  })
}

export default app
