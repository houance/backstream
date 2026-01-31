import { Hono } from 'hono'
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import infoRoute from './routes/info'
import { db } from './service/db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Env = {
  Variables: {
    db: typeof db;
  };
};

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  c.set('db', db);
  await next();
});

// Get absolute path to the current file's directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serve static files ONLY in production
if (process.env.NODE_ENV === 'production') {
  // Use absolute paths to avoid CWD confusion
  const staticPath = path.resolve(__dirname, '../../web/dist');

  app.use('/*', serveStatic({ root: staticPath }));
  app.get('*', serveStatic({ path: path.join(staticPath, 'index.html') }));
}

// Define prefix for all data routes
const routes = app.basePath('/api')
    .route('/info', infoRoute)

// Export the AppType for the frontend
export default app
export type AppType = typeof routes

if (process.env.NODE_ENV === 'production') {
  serve({
    fetch: app.fetch,
    port: 3000,
    hostname: '0.0.0.0',
  }, (info) => {
    console.log(`Server is running on http://${info.address}:${info.port}`)
  })
}
