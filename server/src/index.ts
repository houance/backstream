import { Hono } from 'hono'
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import infoRoute from './routes/info.js'
import { db } from './service/db/index.js';

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

// Serve static files ONLY in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../web/dist' }));
  app.get('*', serveStatic({ path: '../web/dist/index.html' }));
}

// Define prefix for all data routes
const routes = app.basePath('/api')
    .route('/info', infoRoute)

// Export the AppType for the frontend
export default app
export type AppType = typeof routes

serve({
  fetch: app.fetch,
  port: 3000,
  hostname: 'localhost',
}, (info) => {
  console.log(`Server is running on http://${info.address}:${info.port}`)
})
