import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {type Env} from '../index'
import {setting, updateSystemSettingSchema} from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";


const settingRoute = new Hono<Env>()
    // GET system setting
    .get('/system-setting', async (c) => {
        const settings = c.var.provider.get();
        if (!settings) return c.json({ error: 'not found' }, 404);
        return c.json(settings);
    })
    // update system setting
    .post('/',
        zValidator('json', updateSystemSettingSchema),
        async (c) => {
            const values = c.req.valid('json');
            const settings = c.var.provider.get();
            if (!settings || settings.id !== values.id) return c.json({ error: 'not found' }, 404);

            const newSettings = await c.var.provider.update(values);
            return c.json(newSettings);
        });

export default settingRoute;