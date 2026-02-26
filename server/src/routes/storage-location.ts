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
            return c.json({ error: result.errorMsg }, 400);
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
        // todo: 需要检查关联的 policy 是否已删除
        const id = Number(c.req.param('id'));
        // scheduler 删除
        const [dbResult] = await c.var.db.select().from(repository).where(eq(repository.id, id));
        if (!dbResult) return c.json({ error: 'Not found'}, 404);
        await c.var.scheduler.deleteResticService(updateRepositorySchema.parse(dbResult))
        await c.var.db.delete(repository).where(eq(repository.id, id))

        return c.json({ success: true, id });
    });

export default storageRoute;
