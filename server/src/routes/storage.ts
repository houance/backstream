import { Hono } from 'hono';
import {and, count, desc, eq, getTableColumns, gte, lte, sql, or, inArray} from 'drizzle-orm';
import {type Env} from '../index'
import {
    updateRepositorySchema,
    insertRepositorySchema,
    repository,
    snapshotsMetadata,
    execution,
    filterQuery,
    failHistory,
    scheduleStatus,
    type FilterQuery,
    commandType,
    type OnGoingProcess,
    updateExecutionSchema,
    type UpdateRepositorySchema,
    storageCreateSchema,
    type StorageCreateSchema,
    type InsertRepoScheduleSchema, jobSchedules, type UpdateRepoScheduleSchema, updateRepoScheduleSchema, execStatus
} from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";
import {RepositoryClient} from '../service/restic';
import { z } from 'zod';
import {readFile} from "node:fs/promises";
import {getLogs, getTimeRange} from "./utils";
import {Cron} from "croner";


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
        const [[repoWithSnapStat], schedules, lastMaintTime] = await Promise.all([
            getRepoWithSnapStat(c.var.db, storageId),
            getRepoSchedule(c.var.db, storageId),
            getRepoLastMaintTime(c.var.db, storageId)
        ]);
        if (!repoWithSnapStat || !schedules) return c.json({ error: 'Not found' }, 404);
        return c.json({
            repo: updateRepositorySchema.parse(repoWithSnapStat),
            statJob: schedules.statJob,
            snapshotsJob: schedules.snapshotsJob,
            snapshotCount: repoWithSnapStat.snapshotCount,
            snapshotSize: repoWithSnapStat.snapshotSize,
            checkJob: schedules.checkJob,
            pruneJob: schedules.pruneJob,
            lastCheckTimestamp: lastMaintTime.checkTime,
            lastPruneTimestamp: lastMaintTime.pruneTime
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
                        inArray(execution.executeStatus, [execStatus.FAIL, execStatus.REJECT, execStatus.KILL]),
                        eq(execution.repositoryId, storageId),
                        gte(execution.scheduledAt, start),
                        lte(execution.scheduledAt, end),
                    ))
                    .limit(filterQuery.pageSize)
                    .offset(filterQuery.page - 1 < 0 ? 0 : filterQuery.page - 1),
                c.var.db.select({ count: count() }).from(execution)
                    .where(and(
                        inArray(execution.executeStatus, [execStatus.FAIL, execStatus.REJECT, execStatus.KILL]),
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
                    scheduledAt: exec.scheduledAt,
                    startAt: exec.startedAt,
                    finishedAt: exec.finishedAt,
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
    // test conn
    .post('/test-connection',
        zValidator('json', z.object({
            repo: insertRepositorySchema,
            exist: z.boolean()
        })),
        async (c) => {
            const validated = c.req.valid('json');
            const values = validated.repo;
            const client = new RepositoryClient(
                values.path,
                values.password,
                values.repositoryType,
                values.certification
            )
            const result = await client.isRepoExist();
            if (!result.success) return c.json({ success: false, error: 'please check connection detail' }, 400);
            const repoExist = result.result;
            if (validated.exist && !repoExist) return c.json({ success: false, error: 'repo not exist' }, 400);
            if (!validated.exist && repoExist) return c.json({ success: false, error: 'repo already exist' }, 400);
            return c.json( { success: true, message: 'OK'} );
        }
    )
    // create repo
    .post('/',
        zValidator('json', storageCreateSchema),
        async (c) => {
            const validated = c.req.valid('json');
            // validate duplicate repo
            const repoMeta = validated.meta;
            const dbResult = await c.var.db.select()
                .from(repository)
                .where(and(
                    eq(repository.path, repoMeta.path),
                    eq(repository.repositoryType, repoMeta.repositoryType)
                ));
            if (dbResult.length > 0) {
                return c.json({ error: `duplicate path` }, 409);
            }
            // get fromRepo if provide
            let fromRepo: UpdateRepositorySchema | undefined;
            if (validated.mode === 'create' && validated.fromRepoId) {
                const [fromRepoDb] = await c.var.db.select().from(repository)
                    .where(eq(repository.id, validated.fromRepoId));
                if (!fromRepoDb) return c.json({ error: `From repo not found` }, 404);
                fromRepo = updateRepositorySchema.parse(fromRepoDb);
            }
            // add new repo and schedule
            let newRepo: UpdateRepositorySchema;
            try {
                newRepo = createRepoAndSchedule(c.var.db, validated);
            } catch (error) {
                return c.json({ error: `create new repo db fail. error: ${error}` }, 500);
            }
            // scheduler 创建仓库并开始调度
            const createError = await c.var.scheduler.addResticService(
                newRepo,
                validated.mode === 'connect',
                fromRepo
            );
            if (createError !== undefined) {
                return c.json({error: createError}, 500);
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

async function getRepoWithSnapStat(db: Env['Variables']['db'], repoId: number) {
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

async function getRepoSchedule(db: Env['Variables']['db'], repoId: number) {
    const result = await db.select().from(jobSchedules)
        .where(and(
            eq(jobSchedules.repositoryId, repoId),
            eq(jobSchedules.category, 'repository'),
        ));
    if (!result?.length) return null;
    const validated = updateRepoScheduleSchema.array().parse(result);
    const checkJob = validated.find(j => j.type === 'check');
    const pruneJob = validated.find(j => j.type === 'prune');
    const snapshotsJob = validated.find(j => j.type === 'snapshots');
    const statJob = validated.find(j => j.type === 'stat');
    // Using a "guard" to ensure both exist and satisfy the return type
    if (checkJob?.type === 'check'
        && pruneJob?.type === 'prune'
        && snapshotsJob?.type === 'snapshots'
        && statJob?.type === 'stat') {
        return { checkJob, pruneJob, snapshotsJob, statJob };
    }
    return null;
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

function createRepoAndSchedule(db: Env['Variables']['db'], data: StorageCreateSchema) {
    return db.transaction(tx => {
        // create repo
        const repo = tx.insert(repository)
            .values({ ...data.meta, linkStatus: 'DOWN', healthStatus: 'INITIALIZING', adminStatus: 'ACTIVE' })
            .returning()
            .get();
        // create all schedule
        const schedules: InsertRepoScheduleSchema[] = [];
        schedules.push({
            ...data.checkSchedule,
            repositoryId: repo.id,
            nextRunAt: new Cron(data.checkSchedule.cron).nextRun()?.getTime()
        })
        schedules.push({
            ...data.pruneSchedule,
            repositoryId: repo.id,
            nextRunAt: new Cron(data.pruneSchedule.cron).nextRun()?.getTime()
        })
        const heartbeatCron = randomizedCron(5, 'minute');
        schedules.push({
            category: 'repository',
            type: 'heartbeat',
            repositoryId: repo.id,
            cron: heartbeatCron,
            nextRunAt: new Cron(heartbeatCron).nextRun()?.getTime(),
            jobStatus: 'ACTIVE'
        })
        const statCron = randomizedCron(12, 'hour');
        schedules.push({
            category: 'repository',
            type: 'stat',
            repositoryId: repo.id,
            cron: statCron,
            nextRunAt: new Cron(statCron).nextRun()?.getTime(),
            jobStatus: 'ACTIVE'
        })
        const snapshotsCron = randomizedCron(1, 'hour');
        schedules.push({
            category: 'repository',
            type: 'snapshots',
            repositoryId: repo.id,
            cron: snapshotsCron,
            nextRunAt: new Cron(snapshotsCron).nextRun()?.getTime(),
            jobStatus: 'ACTIVE'
        })
        tx.insert(jobSchedules)
            .values(schedules)
            .returning()
            .all();
        return updateRepositorySchema.parse(repo);
    })
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


export default storageRoute;
