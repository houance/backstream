import { Hono } from 'hono';
import {type Env} from '../index'
import {
    backupTarget,
    execution,
    insertBackupPolicySchema, type OnGoingBackupProcess,
    strategy,
    updateBackupPolicySchema, updateExecutionSchema, updateRepositorySchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, desc, eq, inArray} from "drizzle-orm";
import * as os from 'os';
import {Cron} from "croner";
import type {ResticResult, Task} from "../service/restic";
import {readFile} from "node:fs/promises";

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
        const result:OnGoingBackupProcess[] = [];
        // 查询 ongoing snapshot
        const onGoingProcess = await getStrategyOnGoingProcess(c.var.db, strategyId);
        if (onGoingProcess === null) return c.json(result);
        for (const target of onGoingProcess.targets) {
            const [exec] = target.executions;
            const repo = updateRepositorySchema.parse(target.repository)
            if (exec) {
                // 判断 exec 是 pending 还是 running
                const rs = await c.var.scheduler.getResticService(repo);
                const runningJob = rs.getRunningJob(updateExecutionSchema.parse(exec));
                if (runningJob === null) {
                    result.push({
                        executionId: exec.id,
                        uuid: exec.uuid,
                        status: 'pending',
                        createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                        repoName: repo.name
                    })
                } else {
                    // 获取 progress
                    const progress = runningJob.getProgress()
                    // 获取 logs
                    const logs = await getLogs(runningJob);
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
                        repoName: repo.name
                    })
                }
            }
        }
        return c.json(result);
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

async function getLogs(task: Task<ResticResult<any>>): Promise<string[]> {
    try {
        // Read both files concurrently to save time
        const [stdoutRaw, stderrRaw] = await Promise.all([
            readFile(task.logFile, 'utf-8'),
            readFile(task.errorFile, 'utf-8')
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

export default policyRoute;