import { Hono } from 'hono'
import {serve} from "@hono/node-server";
import {serveStatic} from "@hono/node-server/serve-static";


const app = new Hono()

// Define prefix for all data routes
const api = app.basePath('/api')
// Define your backup routes using the chainable API
const routes = api.get('/backups', (c) => {
  return c.json({
    jobs: [{ id: '1', status: 'idle', tool: 'restic' }]
  })
})

// Serve built React files and fallback route
app.use('/*', serveStatic({ root: '../web/dist' }))
app.get('*', serveStatic({ path: '../web/dist/index.html' }))

// Export the AppType for the frontend
export type AppType = typeof routes
export default app

serve({
  fetch: app.fetch,
  port: 3000,
  hostname: 'localhost',
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
