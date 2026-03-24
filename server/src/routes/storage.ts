import { Hono } from 'hono';
import {and, count, desc, eq, getTableColumns, gte, lte, sql} from 'drizzle-orm';
import {type Env} from '../index'
import {
    updateRepositorySchema,
    insertRepositorySchema,
    repository,
    snapshotsMetadata,
    execution,
    filterQuery, failHistory, type FilterQuery, commandType, type OnGoingProcess, updateExecutionSchema
} from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";
import {RepositoryClient} from '../service/restic';
import { z } from 'zod';
import {getExitCodeName} from "./policy";
import {readFile} from "node:fs/promises";


const storageRoute = new Hono<Env>()
    // GET all repo
    .get('/all-storage-location', async (c) => {
        const locations = await c.var.db.select().from(repository);
        if (!locations) return c.json({ error: 'not found'}, 404);
        // validate it through zod schema
        const validated = updateRepositorySchema.array().parse(locations)
        return c.json(validated);
    })
    .get('/storage-detail/:id', async (c) => {
        const storageId = Number(c.req.param('id'));
        const [repoData] = await getRepoData(c.var.db, storageId);
        if (!repoData) return c.json({ message: 'Not found'}, 404);
        const { checkTime, pruneTime } = await getRepoLastMaintTime(c.var.db, storageId);
        return c.json({
            repo: updateRepositorySchema.parse(repoData),
            snapshotCount: repoData.snapshotCount,
            snapshotSize: repoData.snapshotSize,
            lastCheckTimestamp: checkTime,
            lastPruneTimestamp: pruneTime
        });
    })
    .get('/process/:id', async (c) => {
        const storageId = Number(c.req.param('id'));
        const result:OnGoingProcess[] = [];
        // 查询 ongoing snapshot
        const onGoingProcess = await getRepoProcess(c.var.db, storageId);
        if (onGoingProcess === null) return c.json(result);
        for (const exec of onGoingProcess) {
            const repo = updateRepositorySchema.parse(exec.repository);
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
    .post('/fail-history',
        zValidator('json', z.object({
            storageId: z.number().positive(),
            filterQuery: filterQuery
        })),
        async (c) => {
            const validated = c.req.valid('json');
            const { storageId, filterQuery } = validated;
            const {start, end} = getTimeRange(filterQuery);
            // get all execution by filter
            const [execs, totalCount] = await Promise.all([
                c.var.db.select().from(execution)
                    .where(and(
                        eq(execution.executeStatus, 'fail'),
                        eq(execution.repositoryId, storageId),
                        gte(execution.scheduledAt, start),
                        lte(execution.scheduledAt, end),
                    ))
                    .limit(filterQuery.pageSize)
                    .offset(filterQuery.page - 1 < 0 ? 0 : filterQuery.page - 1),
                c.var.db.select({ count: count() }).from(execution)
                    .where(and(
                        eq(execution.executeStatus, 'fail'),
                        eq(execution.repositoryId, storageId),
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
    // test conn
    .post('/test-connection',
        zValidator('json', insertRepositorySchema),
        async (c) => {
            const values = c.req.valid('json');
            const client = new RepositoryClient(
                values.path,
                values.password,
                values.repositoryType,
                values.certification
            )
            const result = await client.isRepoExist()
            if (result.success) return c.json( { message: 'OK'} );
            return c.json({ error: result.error.toString() }, 400);
        }
    )
    // create repo
    .post('/',
        zValidator('json', insertRepositorySchema),
        async (c) => {
            const values = c.req.valid('json');
            // 校验重复 repo
            const [dbResult] = await c.var.db.select()
                .from(repository)
                .where(eq(repository.path, values.path));
            if (dbResult !== undefined) {
                return c.json({ error: `duplicate path` }, 400);
            }
            // 数据库新增记录
            values.repositoryStatus = 'Disconnected'
            const [newRepo] = await c.var.db.insert(repository)
                .values(values)
                .returning();
            // scheduler 创建仓库并开始调度
            const createResult = await c.var.scheduler.addResticService(updateRepositorySchema.parse(newRepo));
            if (createResult !== undefined) {
                return c.json({error: createResult}, 500);
            }
            return c.json(newRepo, 201);
        })
    // update repo, currently support rename
    .patch('/:id',
        zValidator('json', updateRepositorySchema.partial()),
        async (c) => {
            const values = c.req.valid('json');
            if (values.name === undefined) return c.json({ error: 'name is not provided' }, 400);
            const id = Number(c.req.param('id'));
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, id));
            if (repo === undefined) return c.json({ error: 'Not found'}, 404);
            // scheduler 对应的 restic service 更新 repo name
            const clientRecord = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            if (clientRecord.status !== 'active') return c.json({ error: `repo ${repo.name} is not active`});
            const updatedRepo = await clientRecord.client.renameRepo(values.name);
            return c.json(updatedRepo);
        })
    // delete repo
    .delete('/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, id));
        if (!repo) return c.json({ error: 'Not found' }, 404);
        const validRepo = updateRepositorySchema.parse(repo);
        // scheduler 删除
        const result = await c.var.scheduler.stopResticService(validRepo);
        if (result.length > 0) return c.json({error: `policy ${result} still running, please delete them first`}, 400);
        // db 删除
        await c.var.db.delete(repository).where(eq(repository.id, id))
        return c.json({ success: true, id });
    });

async function getRepoProcess(db: Env['Variables']['db'], repoId: number) {
    const [ [checkExec], [pruneExec] ] = await Promise.all([
        db.query.execution.findMany({
            where: (execution, { and, eq, inArray }) => and(
                eq(execution.repositoryId, repoId),
                inArray(execution.executeStatus, ['running', 'pending']),
                eq(execution.commandType, commandType.check)
            ),
            orderBy: (execution, { desc }) => [desc(execution.scheduledAt)],
            limit: 1,
            with: {
                repository: true
            }
        }),
        db.query.execution.findMany({
            where: (execution, { and, eq, inArray }) => and(
                eq(execution.repositoryId, repoId),
                inArray(execution.executeStatus, ['running', 'pending']),
                eq(execution.commandType, commandType.prune)
            ),
            orderBy: (execution, { desc }) => [desc(execution.scheduledAt)],
            limit: 1,
            with: {
                repository: true
            }
        }),
    ]);
    if (checkExec && pruneExec) return [checkExec, pruneExec];
    if (checkExec) return [checkExec];
    if (pruneExec) return [pruneExec];
    return null;
}

async function getRepoData(db: Env['Variables']['db'], repoId: number) {
    return db
        .select({
            // Spreads all columns from the repository table automatically
            ...getTableColumns(repository),
            // Add your aggregate fields
            snapshotCount: sql<number>`count(${snapshotsMetadata.id})`.mapWith(Number),
            snapshotSize: sql<number>`coalesce(sum(${snapshotsMetadata.size}),0)`.mapWith(Number),
        })
        .from(repository)
        .leftJoin(
            snapshotsMetadata,
            eq(repository.id, snapshotsMetadata.repositoryId)
        )
        .where(eq(repository.id, repoId))
        .groupBy(repository.id);
}

async function getRepoLastMaintTime(db: Env['Variables']['db'], repoId: number) {
    const [ [checkExec], [pruneExec] ] = await Promise.all([
        db.select().from(execution)
            .where(and(
                eq(execution.repositoryId, repoId),
                eq(execution.commandType, commandType.check),
                eq(execution.executeStatus, 'success')
            ))
            .orderBy(desc(execution.finishedAt))
            .limit(1),
        db.select().from(execution)
            .where(and(
                eq(execution.repositoryId, repoId),
                eq(execution.commandType, commandType.prune),
                eq(execution.executeStatus, 'success')
            ))
            .orderBy(desc(execution.finishedAt))
            .limit(1)
    ]);
    return { checkTime: checkExec?.finishedAt, pruneTime: pruneExec?.finishedAt };
}

function getTimeRange(filter: FilterQuery) {
    const start = Math.max(0, filter.startTime ?? 0);
    let end = Date.now();
    if (filter.endTime !== undefined && filter.endTime !== 0) {
        end = filter.endTime;
    }
    return { start, end };
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

export default storageRoute;
