import { Hono } from 'hono';
import {and, desc, eq, getTableColumns, sql} from 'drizzle-orm';
import {type Env} from '../index'
import {updateRepositorySchema, insertRepositorySchema, repository, snapshotsMetadata, execution} from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";
import {RepositoryClient} from '../service/restic'


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
                eq(execution.commandType, 'check'),
                eq(execution.executeStatus, 'success')
            ))
            .orderBy(desc(execution.finishedAt))
            .limit(1),
        db.select().from(execution)
            .where(and(
                eq(execution.repositoryId, repoId),
                eq(execution.commandType, 'prune'),
                eq(execution.executeStatus, 'success')
            ))
            .orderBy(desc(execution.finishedAt))
            .limit(1)
    ]);
    return { checkTime: checkExec?.finishedAt, pruneTime: pruneExec?.finishedAt };
}

export default storageRoute;
