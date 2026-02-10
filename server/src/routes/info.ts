import { Hono } from 'hono';
import {type Activity} from "@backstream/shared";
import {type Env} from '../index'

const infoRoute = new Hono<Env>()
    .get('/health', (c) => c.json({ message:'OK'}))
    .get('/activity', async (c) => {
        const dbResult = await c.var.db.query.execution.findMany({
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
    .get('/stats', async (c) => {
        const dbResult = await c.var.db.query.strategy.findMany({
            with: {
                targets: {
                    with: {
                        // Fetch only the single latest backup finished execution
                        executions: {
                            columns: {
                                executeStatus: true,
                                finishedAt: true,
                            },
                            where: (execution, { and, eq }) => and(
                                eq(execution.commandType, 'backup'),
                            ),
                            orderBy: (execution, { desc }) => [desc(execution.finishedAt)],
                            limit: 1,
                        },
                    },
                },
            },
        });
        if (!dbResult) return c.json({ error: 'db error' }, 500);
        let totalSize = 0, failStrategy = 0;
        dbResult.forEach(item => {
            totalSize += item.dataSourceSize;
            const hasFailedTarget = item.targets.some((target) => {
                const latestExecution = target.executions[0]; // limit: 1 ensures this is the latest
                return latestExecution?.executeStatus === 'fail';
            });
            if (hasFailedTarget) failStrategy++;
        })
        return c.json({
            activeCount: dbResult.length,
            totalSize: totalSize,
            successRate: dbResult.length > 0 ?
                (dbResult.length - failStrategy) / dbResult.length
                : 0
        });
    })

export default infoRoute;
