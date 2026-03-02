import { Hono } from 'hono';
import {type Env} from '../index'
import {backupTarget, insertBackupPolicySchema, strategy, updateBackupPolicySchema} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {eq} from "drizzle-orm";
import * as os from 'os';
import {Cron} from "croner";

const policyRoute = new Hono<Env>()
    .get('/all-policy', async (c) => {
        const dbResult = await getStrategyData(c.var.db);
        // validate with zod
        const validated = updateBackupPolicySchema.array().parse(dbResult);
        return c.json(validated);
    })
    .post('/',
        zValidator('json', insertBackupPolicySchema),
        async (c) => {
            const validated = c.req.valid('json');
            const strategyValid = validated.strategy;
            const targetsValid = validated.targets;
            // 校验 datasource 重复
            const dbResult = await c.var.db.select().from(strategy)
                .where(eq(strategy.dataSource, strategyValid.dataSource))
            if (dbResult && dbResult.length >= 1) return c.json({error: 'duplicate datasource'}, 400);
            // 插入 policy
            strategyValid.hostname = os.hostname();
            strategyValid.dataSourceSize = 0;
            const [newStrategy] = await c.var.db.insert(strategy)
                .values(strategyValid)
                .returning();
            if (!newStrategy) return c.json({error: 'db error'}, 500);
            // 插入 targets
            targetsValid.forEach(target => {
                target.backupStrategyId = newStrategy.id;
                target.nextBackupAt = new Cron(target.schedulePolicy).nextRun()!.getTime();
            })
            await c.var.db.insert(backupTarget).values(targetsValid).returning();
            // scheduler 开始调度
            void c.var.scheduler.addPolicyScheduleByStrategyId(newStrategy.id);
            return c.json({ message: `success create policy ${newStrategy.name }`}, 200);
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