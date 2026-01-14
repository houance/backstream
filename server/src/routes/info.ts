import { Hono } from 'hono';

const infoRoute = new Hono()
    .get('/health', (c) => c.json({ message:'OK'}))

export default infoRoute;
