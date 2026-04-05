import {Hono} from "hono";
import {type Env} from '../index'
import {zValidator} from "@hono/zod-validator";
import {
    filterQuery,
    type FilterQuery,
    repository, restoreDataSchema,
    restores, type SnapshotFile,
    snapshotFile, snapshotsMetadata, updateExecutionSchema, updateRepositorySchema,
    updateRestoreSchema, updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {and, eq, gte, lte, inArray, count} from "drizzle-orm";
import path from "node:path";
import { stream } from 'hono/streaming'
import {open, readFile} from "node:fs/promises";
import {FileManager} from "../service/backup-manager/file-manager";
import {getLogs, getTimeRange} from "./utils";

const restoreRoute = new Hono<Env>()
    .post('/all-restores',
        zValidator('json', filterQuery),
        async (c) => {
            const filter = c.req.valid('json');
            const [ dbResult, countResult ] = await getAllRestoreData(c.var.db, filter);
            if (!dbResult) return c.json({ error: 'query restores db error'}, 500);
            if (countResult[0].count === 0) return c.json({
                restores: [],
                totalCount: 0
            });
            // todo: enhance file's path to include policy name and repo name
            const validated = restoreDataSchema.array().parse(dbResult);
            return c.json({
                restores: validated,
                totalCount: countResult[0].count
            });
    })
    .post('/submit-restore',
        zValidator('json', snapshotFile),
        async (c) => {
            const validated = c.req.valid('json');
            // check if snapshot exist
            const snapshot = await c.var.db.query.snapshotsMetadata.findFirst({
                where: (snapshotsMetadata, { and, eq }) => and(
                    eq(snapshotsMetadata.repositoryId, validated.repoId),
                    eq(snapshotsMetadata.snapshotId, validated.snapshotId),
                ),
                with: {
                    restores: {
                        with: {
                            executions: {
                                where: (executions, { inArray }) => inArray(
                                    executions.executeStatus, ['success', 'running', 'pending']
                                )
                            }
                        }
                    }
                }
            });
            if (!snapshot) return c.json({ message: 'Not found'}, 404);
            // check if already restore
            for (let restore of updateRestoreSchema.array().parse(snapshot.restores)) {
                if (restore.files[0].path === validated.path) return c.json({ key: restore.id }, 200) // 200 for Existing restore
            }
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, validated.repoId));
            const clientRecord = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            if (clientRecord.status !== 'active') return c.json({ error: `repo ${repo.name} not active` }, 500);
            // start restore
            const key = await clientRecord.client.restoreSnapshotFile(validated, updateSnapshotsMetadataSchema.parse(snapshot));
            return c.json({ key: key }, 201); // 201 for newly created restore
        })
    .get('/restore-log/:id', async (c) => {
        const restoreId = Number(c.req.param('id'))
        const restoreData = await getRestoreData(c.var.db, restoreId);
        if (!restoreData?.executions?.length) return c.json({ message: 'Not found'}, 404);
        if (restoreData.executions[0].executeStatus === 'pending') return c.json([]);
        const exec = restoreData.executions[0];
        const logs = await getLogs(exec.logFile);
        return c.json(logs);
    })
    .on(['GET', 'HEAD'], '/download-restore-file', async (c) => {
        const key = Number(c.req.query('key'));
        const restoreData = await getRestoreData(c.var.db, key);
        if (!restoreData) return c.json({ message: 'Not found'}, 404);
        if (restoreData.executions[0].executeStatus !== 'success') return c.json({ message: 'Not a success restore' }, 400);
        // get restore file
        const filePath = restoreData.serverPath!;
        const CHUNK_SIZE = 512 * 1024;
        // Set necessary binary stream headers
        c.header('Content-Type', 'application/octet-stream')
        c.header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
        c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        // Handle HEAD request (Pre-flight check from React)
        if (c.req.method === 'HEAD') {
            return c.body(null, 200); // Return headers only, no file body
        }
        // return stream
        return stream(c, async (stream) => {
            const file = await open(filePath)
            const buffer = Buffer.alloc(CHUNK_SIZE)
            // handle user abort
            let isAborted = false;
            stream.onAbort(() => {
                isAborted = true;
            })
            try {
                let bytesRead
                while (!isAborted && (bytesRead = (await file.read(buffer, 0, CHUNK_SIZE)).bytesRead) > 0) {
                    // Write the specific MB block to the stream
                    await stream.write(buffer.subarray(0, bytesRead))
                }
            } catch (e) {
                c.var.logger.warn(e, `Streaming ${path.basename(filePath)} error (likely disconnect):`)
            }finally {
                await file.close()
            }
        })
    })
    .delete('/:id', async (c) => {
        const restoreId = Number(c.req.param('id'));
        const restore = await c.var.db.query.restores.findFirst({
            where: (restores, { eq }) => eq(restores.id, restoreId),
            with: {
                executions: true,
                snapshot: {
                    with: {
                        repository: true
                    }
                }
            }
        })
        if (!restore) return c.json({ message: 'Not found' }, 404);
        // 停止正在 restore 的 job
        const validatedRepo = updateRepositorySchema.parse(restore.snapshot.repository);
        const clientRecord = await c.var.scheduler.getResticService(validatedRepo);
        if (clientRecord.status === 'active') {
            updateExecutionSchema.array().parse(restore.executions).forEach(
                exec => clientRecord.client.stopJobByExec(exec)
            );
        }
        // delete restore record
        await c.var.db.delete(restores).where(eq(restores.id, restoreId));
        // delete file
        if (restore.serverPath) void FileManager.deleteFileAndFolder(restore.serverPath)
        return c.json({ success: true, restoreId });
    })

async function getAllRestoreData(db: Env['Variables']['db'], filterQuery: FilterQuery) {
    const { start, end } = getTimeRange(filterQuery)
    return await Promise.all([
        db.query.restores.findMany({
            where: (restores, { gte, lte, and }) => and(
                gte(restores.createdAt, start),
                lte(restores.createdAt, end)
            ),
            limit: filterQuery.pageSize,
            offset: filterQuery.page - 1 > 0 ? filterQuery.page - 1 : 0,
            with: {
                executions: {
                    orderBy: (execution, { desc }) =>
                        [desc(execution.id)],
                    limit: 1
                }
            }
        }),
        db.select({ count: count() }).from(restores)
            .where(and(
                gte(restores.createdAt, start),
                lte(restores.createdAt, end)
            ))
    ]);
}

async function getRestoreData(db: Env['Variables']['db'], id: number) {
    const result = await db.query.restores.findFirst({
        where: (restores, { eq }) => eq(restores.id, id),
        with: {
            executions: {
                orderBy: (execution, { desc }) =>
                    [desc(execution.id)],
                limit: 1
            }
        }
    })
    return result ?? null;
}

export default restoreRoute;