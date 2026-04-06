import { Hono } from 'hono';
import {type Env} from '../index'
import {
    backupTarget,
    execution,
    failHistory,
    type FilterQuery,
    filterQuery,
    type InsertBackupPolicySchema,
    insertBackupPolicySchema, type InsertStrategyScheduleSchema, insertStrategyScheduleSchema,
    jobSchedules,
    type OnGoingProcess, scheduleStatus,
    strategy,
    updateBackupPolicySchema,
    updateBackupStrategySchema,
    type UpdateBackupStrategySchema,
    updateExecutionSchema,
    updateRepositorySchema, updateStrategyScheduleSchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, count, desc, eq, gte, inArray, lte} from "drizzle-orm";
import * as os from 'os';
import {readFile} from "node:fs/promises";
import z from 'zod';
import {getLogs, getTimeRange} from "./utils";
import {Cron} from "croner";

const policyRoute = new Hono<Env>()
    .get('/all-policy', async (c) => {
        const dbResult = await getStrategyData(c.var.db);
        // validate with zod
        const validated = updateBackupPolicySchema.array().parse(dbResult);
        return c.json(validated);
    })
    // get policy detail by id
    .get('/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const dbResult = await getStrategyDataById(c.var.db, id);
        if (dbResult === null) return c.json({ message: 'Not found'}, 404);
        const validated = updateBackupPolicySchema.parse(dbResult);
        return c.json(validated);
    })
    .get('/process/:id', async (c) => {
        const strategyId = Number(c.req.param('id'));
        const result:OnGoingProcess[] = [];
        // 查询 ongoing snapshot
        const onGoingProcess = await getStrategyOnGoingProcess(c.var.db, strategyId);
        if (onGoingProcess === null) return c.json(result);
        for (const target of onGoingProcess.targets) {
            const [exec] = target.executions;
            if (!exec) continue;
            // 判断 exec 是 pending 还是 running
            const repo = updateRepositorySchema.parse(target.repository)
            const clientRecord = await c.var.scheduler.getResticService(repo);
            if (clientRecord.status !== 'active') return c.json(result);
            const runningJob = clientRecord.client.getRunningJob(updateExecutionSchema.parse(exec));
            if (runningJob === null) {
                result.push({
                    executionId: exec.id,
                    uuid: exec.uuid,
                    status: 'pending',
                    createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                    repoName: repo.name,
                    commandType: exec.commandType,
                })
            } else {
                // 获取 progress
                const progress = runningJob.getProgress()
                // 获取 logs
                const logs = await getLogs(runningJob.logFile);
                result.push({
                    executionId: exec.id,
                    uuid: exec.uuid,
                    status: 'running',
                    createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                    progress: {
                        percent: progress?.percentDone,
                        bytesDone: progress?.bytesDone,
                        totalBytes: progress?.totalBytes,
                        logs: logs
                    },
                    repoName: repo.name,
                    commandType: exec.commandType,
                })
            }
        }
        return c.json(result);
    })
    // get fail history by target
    .post('/fail-history',
        zValidator('json', z.object({
            targetId: z.number().positive(),
            filterQuery: filterQuery
        })),
        async (c) => {
            const validated = c.req.valid('json');
            const { targetId, filterQuery } = validated;
            const {start, end} = getTimeRange(filterQuery);
            // get all execution by filter
            const [execs, totalCount] = await Promise.all([
                c.var.db.select().from(execution)
                    .where(and(
                        eq(execution.executeStatus, 'fail'),
                        eq(execution.backupTargetId, targetId),
                        gte(execution.scheduledAt, start),
                        lte(execution.scheduledAt, end),
                    ))
                    .limit(filterQuery.pageSize)
                    .offset(filterQuery.page - 1 < 0 ? 0 : filterQuery.page - 1),
                c.var.db.select({ count: count() }).from(execution)
                    .where(and(
                        eq(execution.executeStatus, 'fail'),
                        eq(execution.backupTargetId, targetId),
                        gte(execution.scheduledAt, start),
                        lte(execution.scheduledAt, end),
                    ))
            ])
            if (!execs || !totalCount) {
                c.var.logger.warn('query fail history db fail');
                return c.json({ error: 'Query fail history fail' }, 500);
            } else {
                const mappedFailHistory = execs.map(exec => ({
                    executionId: exec.id,
                    uuid: exec.uuid,
                    scheduledAt: exec.startedAt,
                    startAt: exec.startedAt,
                    finishedAt: exec.scheduledAt,
                    commandType: exec.commandType,
                    fullCommand: exec.fullCommand,
                    failReason: exec.errorMessage,
                }))
                const result = failHistory.array().parse(mappedFailHistory);
                return c.json({
                    failHistory: result,
                    count: totalCount[0].count,
                });
            }
    })
    // create policy
    .post('/',
        zValidator('json', insertBackupPolicySchema),
        async (c) => {
            const validated = c.req.valid('json');
            const strategyValid = validated.strategy;
            // 校验 datasource 重复
            const [dbResult] = await c.var.db.select().from(strategy)
                .where(eq(strategy.dataSource, strategyValid.dataSource))
            if (dbResult !== undefined) return c.json({error: 'duplicate datasource'}, 400);
            // create new policy
            let newStrategy: UpdateBackupStrategySchema;
            try {
                newStrategy = createStrategyAndTarget(c.var.db, validated);
            } catch (error) {
                return c.json({ error: `create new policy db fail. error: ${error}` }, 500);
            }
            // scheduler 开始调度
            void c.var.scheduler.addPolicySchedule(newStrategy.id);
            return c.json({ message: `success create policy ${newStrategy.name }`}, 200);
        })
    // delete policy
    .delete('/:id', async (c) => {
        const id = Number(c.req.param('id'));
        // scheduler 停止调度
        const result = await c.var.scheduler.stopPolicy(id);
        if (result.status === 'Not found') return c.json({error: 'Not found'}, 404);
        // 级联删除 strategy
        await c.var.db.delete(strategy).where(eq(strategy.id, id));
        return c.json({ message: `success delete policy ${id}`}, 200);
    })

function createStrategyAndTarget(db: Env['Variables']['db'], data: InsertBackupPolicySchema) {
    return db.transaction(tx => {
        const newStrategy = tx.insert(strategy)
            .values({ ...data.strategy, hostname: os.hostname(), dataSourceSize: 0})
            .returning()
            .get();
        for (let target of data.targets) {
            const newTarget = tx.insert(backupTarget)
                .values({ ...target.meta, backupStrategyId: newStrategy.id })
                .returning()
                .get();
            // add backup/copy schedule
            const newSchedule = tx.insert(jobSchedules)
                .values({
                    ...target.schedule,
                    backupStrategyId: newStrategy.id,
                    backupTargetId: newTarget.id,
                    nextRunAt: new Cron(target.schedule.cron).nextRun()?.getTime()
                })
                .returning()
                .get();
        }
        // add strategy datasize schedule
        const strategySchedule: InsertStrategyScheduleSchema = {
            cron: randomizedCron(5, 'minute'),
            jobStatus: 'ACTIVE',
            category: 'strategy',
            type: 'datasize',
            backupStrategyId: newStrategy.id
        }
        tx.insert(jobSchedules).values(strategySchedule).returning().get();
        return updateBackupStrategySchema.parse(newStrategy);
    })
}

async function getStrategyOnGoingProcess(db: Env['Variables']['db'], id: number) {
    const result = await db.query.strategy.findFirst({
        where: (strategy, { eq }) => eq(strategy.id, id),
        with: {
            targets: {
                with: {
                    repository: true,
                    // Fetch only the single latest backup execution
                    executions: {
                        where: (execution, { inArray }) => inArray(
                            execution.executeStatus, ['running', 'pending']
                        ),
                        orderBy: (execution, { desc }) => [desc(execution.scheduledAt)],
                        limit: 1,
                    },
                },
            },
        },
    });
    return result ?? null
}

async function getStrategyDataById(db: Env['Variables']['db'], id: number) {
    const result = await db.query.strategy.findFirst({
        where: (strategy, { eq }) => eq(strategy.id, id),
        with: {
            targets: {
                with: {
                    job: true,
                    repository: true,
                    // Fetch only the single latest backup execution
                    executions: {
                        columns: {
                            startedAt: true,
                        },
                        where: (execution, { and, eq, or }) => and(
                            or(
                                eq(execution.commandType, 'backup'),
                                eq(execution.commandType, 'copy')
                            ),
                            eq(execution.executeStatus, 'success'),
                        ),
                        orderBy: (execution, { desc }) => [desc(execution.startedAt)],
                        limit: 1,
                    },
                },
            },
        },
    });
    if (!result) return null;
    const { targets, ...strategyData } = result
    return {
        strategy: strategyData,
        targets: targets.map(({ executions, ...targetData }) => ({
            ...targetData,
            lastBackupAt: executions[0]?.startedAt ?? null,
        }))
    }
}

async function getStrategyData(db: Env['Variables']['db']) {
    const result = await db.query.strategy.findMany({
        with: {
            targets: {
                with: {
                    job: true,
                    repository: true,
                    // Fetch only the single latest backup execution
                    executions: {
                        columns: {
                            startedAt: true,
                        },
                        where: (execution, { and, eq, or }) => and(
                            or(eq(execution.commandType, 'backup'), eq(execution.commandType, 'copy')),
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

/**
 * Generates a randomized cron string (6 fields: s m h d M dw)
 * @param interval The frequency (e.g., every 5 units)
 * @param unit The time unit to apply the interval to
 */
function randomizedCron(interval: number, unit: 'sec' | 'minute' | 'hour' | 'day' | 'month' | 'year') {
    const rnd = (max: number) => Math.floor(Math.random() * max);

    // Define randomized static values
    const [s, m, h, d, M] = [rnd(60), rnd(60), rnd(24), 1 + rnd(28), 1 + rnd(12)];

    // Map each unit to its 6-field pattern [s, m, h, d, M, dw]
    const patterns: Record<typeof unit, string[]> = {
        sec:    [`*/${interval}`, '*', '*', '*', '*', '*'],
        minute: [`${s}`, `*/${interval}`, '*', '*', '*', '*'],
        hour:   [`${s}`, `${m}`, `*/${interval}`, '*', '*', '*'],
        day:    [`${s}`, `${m}`, `${h}`, `*/${interval}`, '*', '*'],
        month:  [`${s}`, `${m}`, `${h}`, `${d}`, `*/${interval}`, '*'],
        year:   [`${s}`, `${m}`, `${h}`, `${d}`, `${M}`, '*'] // Runs once per year
    };

    return patterns[unit].join(' ');
}

export default policyRoute;