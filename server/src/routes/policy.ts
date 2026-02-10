import { Hono } from 'hono';
import {type Env} from '../index'
import { updateBackupPolicySchema } from "@backstream/shared";

const policyRoute = new Hono<Env>()
    .get('/all-policy', async (c) => {
        const dbResult = await getStrategyData(c.var.db);
        // validate with zod
        const validated = updateBackupPolicySchema.array().parse(dbResult);
        return c.json(validated);
    })


async function getStrategyData(db: Env['Variables']['db']) {
    const result = await db.query.strategy.findMany({
        with: {
            targets: {
                with: {
                    repository: true,
                    // Fetch only the single latest backup execution
                    executions: {
                        columns: {
                            startedAt: true,
                        },
                        where: (execution, { and, eq }) => and(
                            eq(execution.commandType, 'backup'),
                            eq(execution.executeStatus, 'success'),
                        ),
                        orderBy: (execution, { desc }) => [desc(execution.startedAt)],
                        limit: 1,
                    },
                },
            },
        },
    });

    // Small map to flatten 'executions[0].startedAt' into 'lastBackupAt'
    return result.map(({ targets, ...strategyData }) => ({
        strategy: strategyData,
        targets: targets.map(({ executions, ...targetData }) => ({
            ...targetData,
            lastBackupAt: executions[0]?.startedAt ?? null,
        })),
    }));
}

export default policyRoute;