// apps/api/src/routes/repos.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../service/db'; // Your drizzle instance
import {insertRepositorySchema, repository} from '@backstream/shared';
import { updateRepositorySchema } from '@backstream/shared';
import {zValidator} from "@hono/zod-validator";

const storageRoute = new Hono()
    // GET a single repository
    .get('/all-storage-location', async (c) => {
        const locations = await db.select().from(repository);
        if (!locations) return c.json({ error: 'db access error'}, 500);
        // validate it through zod schema
        const validated = updateRepositorySchema.array().parse(locations)
        validated.push({
            id: 1,
            name: "Primary NAS Storage",
            path: "/mnt/nas/backup01",
            repositoryType: "SFTP",
            usage: 3400000000000,
            capacity: 5000000000000,
            repositoryStatus: "Active",
            password: "fdsa"
        })
        return c.json(validated);
    })
    .patch('/storage-location/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json();

        const [updated] = await db.update(repository)
            .set(body)
            .where(eq(repository.id, id))
            .returning();

        return c.json(updateRepositorySchema.parse(updated));
    })
    .post('/',
        zValidator('json', insertRepositorySchema),
        async (c) => {
            const values = c.req.valid('json');
            const [newRepo] = await db.insert(repository)
                .values(values)
                .returning();
            return c.json(newRepo, 201);
        })
    .patch('/:id',
        zValidator('json', updateRepositorySchema),
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
    .delete('/:id', async (c) => {
        const id = Number(c.req.param('id'));

        const [deletedRepo] = await db.delete(repository)
            .where(eq(repository.id, id))
            .returning();

        if (!deletedRepo) return c.json({ error: 'Not found' }, 404);
        return c.json({ success: true, id: deletedRepo.id });
    });

export default storageRoute;
