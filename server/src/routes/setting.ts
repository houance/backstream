import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {type Env} from '../index'
import {setting, updateSettingSchema} from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";


const settingRoute = new Hono<Env>()
    // GET system setting
    .get('/system-setting', async (c) => {
        const settings = await c.var.db.select().from(setting);
        if (!settings) return c.json({ error: 'not found' }, 404);
        const validated = updateSettingSchema.array().parse(settings);
        return c.json(validated[0]);
    })
    // update system setting
    .patch('/:id',
        zValidator('json', updateSettingSchema.partial()),
        async (c) => {
            const id = Number(c.req.param('id'));
            const values = c.req.valid('json');

            const [updateSetting] = await c.var.db.update(setting)
                .set(values)
                .where(eq(setting.id, id))
                .returning();

            if (!updateSetting) return c.json({ error: 'Not found' }, 404);
            return c.json(updateSetting);
        });

export default settingRoute;