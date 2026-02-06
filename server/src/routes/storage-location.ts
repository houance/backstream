import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../service/db'; // Your drizzle instance
import { updateRepositorySchema, insertRepositorySchema, repository } from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";
import { RepositoryClient } from '../service/restic'


const storageRoute = new Hono()
    // GET all repo
    .get('/all-storage-location', async (c) => {
        const locations = await db.select().from(repository);
        if (!locations) return c.json({ error: 'not found'}, 404);
        // validate it through zod schema
        const validated = updateRepositorySchema.array().parse(locations)
        return c.json(validated);
    })
    .post('/test-connection',
        zValidator('json', insertRepositorySchema),
        async (c) => {
        // todo
        }
    )
    // create repo
    .post('/',
        zValidator('json', insertRepositorySchema),
        async (c) => {
        // todo
            const values = c.req.valid('json');
            // 校验重复 repo
            const dbResult = await db.select()
                .from(repository)
                .where(eq(repository.path, values.path));
            if (dbResult) {
                return c.json({ error: `duplicate path` }, 400);
            }
            // 初始化 repo
            const repoClient = new RepositoryClient(
                values.path,
                values.password,
                values.repositoryType,
                values.certification
            );
            const createRepoResult = await repoClient.createRepo();
            if (!createRepoResult.success) return c.json({ error: `init repo failed ${createRepoResult.errorMsg}`}, 500);
            // 更新 repo status, usage, capacity
            values.repositoryStatus = 'Active'

            // 创建 repo
            const [newRepo] = await db.insert(repository)
                .values(values)
                .returning();
            return c.json(newRepo, 201);
        })
    // update repo
    .patch('/:id',
        zValidator('json', updateRepositorySchema.partial()),
        async (c) => {
            const id = Number(c.req.param('id'));
            const values = c.req.valid('json');

            const [updatedRepo] = await db.update(repository)
                .set(values)
                .where(eq(repository.id, id))
                .returning();

            if (!updatedRepo) return c.json({ error: 'Not found' }, 404);
            return c.json(updatedRepo);
        })
    // delete repo
    .delete('/:id', async (c) => {
        // todo
        const id = Number(c.req.param('id'));

        const [deletedRepo] = await db.delete(repository)
            .where(eq(repository.id, id))
            .returning();

        if (!deletedRepo) return c.json({ error: 'Not found' }, 404);
        return c.json({ success: true, id: deletedRepo.id });
    });

export default storageRoute;
