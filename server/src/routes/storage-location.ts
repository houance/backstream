import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {type Env} from '../index'
import { updateRepositorySchema, insertRepositorySchema, repository } from '@backstream/shared';
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
            const dbResult = await c.var.db.select()
                .from(repository)
                .where(eq(repository.path, values.path));
            if (dbResult) {
                return c.json({ error: `duplicate path` }, 400);
            }
            // 数据库新增记录
            values.repositoryStatus = 'Disconnected'
            const [newRepo] = await c.var.db.insert(repository)
                .values(values)
                .returning();
            // scheduler 创建仓库并开始调度
            await c.var.scheduler.addResticService(updateRepositorySchema.parse(newRepo))
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
            const resticService = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo))
            const updatedRepo = await resticService.renameRepo(values.name);
            return c.json(updatedRepo);
        })
    // delete repo
    .delete('/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, id));
        if (!repo) return c.json({ error: 'Not found' }, 404);
        const validRepo = updateRepositorySchema.parse(repo);
        // scheduler 删除
        const result = await c.var.scheduler.deleteResticService(validRepo);
        if (result.length > 0) return c.json({error: `policy ${result} still running, please delete them first`}, 400);
        // db 删除
        await c.var.db.delete(repository).where(eq(repository.id, id))
        return c.json({ success: true, id });
    });

export default storageRoute;
