import { Hono } from 'hono';
import {type Env} from '../index'
import {
    backupTarget,
    execution, failHistory, type FilterQuery, filterQuery,
    insertBackupPolicySchema, type OnGoingProcess,
    strategy,
    updateBackupPolicySchema, updateExecutionSchema, updateRepositorySchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, count, desc, eq, gte, inArray, lte} from "drizzle-orm";
import * as os from 'os';
import {Cron} from "croner";
import {ExitCode, type ResticResult, type Task} from "../service/restic";
import {readFile} from "node:fs/promises";
import z from 'zod';

const policyRoute = new Hono<Env>()
    .get('/all-policy', async (c) => {
        const dbResult = await getStrategyData(c.var.db);
        // validate with zod
        const validated = updateBackupPolicySchema.array().parse(dbResult);
        return c.json(validated);
    })
    // get policy by id
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
                const logs = await getLogs(runningJob.logFile, runningJob.errorFile);
                result.push({
                    executionId: exec.id,
                    uuid: exec.uuid,
                    status: 'running',
                    createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                    progress: {
                        percent: progress.percentDone,
                        bytesDone: progress.bytesDone,
                        totalBytes: progress.totalBytes,
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
                    failReason: getExitCodeName(exec.exitCode),
                }))
                const result = failHistory.array().parse(mappedFailHistory);
                return c.json({
                    failHistory: result,
                    count: totalCount[0].count,
                });
            }
    })
    // get fail log by execution id
    .get('/fail-history-log/:id', async (c) => {
        const executionId = Number(c.req.param('id'));
        const [exec] = await c.var.db.select().from(execution)
            .where(eq(execution.id, executionId));
        if (!exec) return c.json({ message: 'Not found' }, 404);
        return c.json({
            logs: await getLogs(exec.logFile!, exec.errorFile!)
        })
    })
    // create policy
    .post('/',
        zValidator('json', insertBackupPolicySchema),
        async (c) => {
            const validated = c.req.valid('json');
            const strategyValid = validated.strategy;
            const targetsValid = validated.targets;
            // 校验 datasource 重复
            const [dbResult] = await c.var.db.select().from(strategy)
                .where(eq(strategy.dataSource, strategyValid.dataSource))
            if (dbResult !== undefined) return c.json({error: 'duplicate datasource'}, 400);
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

async function getLogs(stdout: string, stderr: string): Promise<string[]> {
    try {
        // Read both files concurrently to save time
        const [stdoutRaw, stderrRaw] = await Promise.all([
            readFile(stdout, 'utf-8'),
            readFile(stderr, 'utf-8')
        ]);

        // Split by newline (handles \n and \r\n)
        const stdoutLines = stdoutRaw.split(/\r?\n/);
        const stderrLines = stderrRaw.split(/\r?\n/);

        // Remove the trailing empty line often left by loggers at the end of a file
        const cleanStdout = stdoutLines.filter((line, i) => line !== "" || i !== stdoutLines.length - 1);
        const cleanStderr = stderrLines.filter((line, i) => line !== "" || i !== stderrLines.length - 1);

        return [...cleanStdout, ...cleanStderr];
    } catch (error) {
        return [`Failed to combine logs: ${(error as Error).message}`];
    }
}

function getTimeRange(filter: FilterQuery) {
    const start = Math.max(0, filter.startTime ?? 0);
    let end = Date.now();
    if (filter.endTime !== undefined && filter.endTime !== 0) {
        end = filter.endTime;
    }
    return { start, end };
}

export function getExitCodeName(code: number | null | undefined): string {
    return Object.entries(ExitCode).find(([_, v]) => v === code)?.[0] ?? "UNKNOWN";
}

export default policyRoute;