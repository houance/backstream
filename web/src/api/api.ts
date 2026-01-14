import { hc } from 'hono/client'
import type { AppType } from '../../../server/src/index' // Import type from server

// Create the type-safe client
export const client = hc<AppType>('/')
