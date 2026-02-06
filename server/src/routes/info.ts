import { Hono } from 'hono';
import { db } from '../service/db'
import {type Activity} from "@backstream/shared";

const infoRoute = new Hono()
    .get('/health', (c) => c.json({ message:'OK'}))
    .get('/activity', async (c) => {
        const dbResult = await db.query.execution.findMany({
            orderBy: (execution, { desc }) => [desc(execution.finishedAt)],
            limit: 20,
            with: {
                target: true,
                strategy: true,
                repository: true,
            },
        });
        if (!dbResult) return c.json({ error: 'db error'}, 500);
        const result: Activity[] = dbResult.map(item => ({
            id: item.id,
            title: item.commandType,
            description: `Performed ${item.commandType} on ${item.repository ? item.repository.name : item.strategy?.name}(${item.executeStatus})`,
            completeAt: item.finishedAt ? item.finishedAt : 0,
            level: item.executeStatus === "fail" ? "ALERT" : "INFO",
        }))

        return c.json(result);
    })

export default infoRoute;
