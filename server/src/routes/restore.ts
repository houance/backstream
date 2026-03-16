import {Hono} from "hono";
import {type Env} from '../index'
import {zValidator} from "@hono/zod-validator";
import {
    filterQuery,
    type FilterQuery,
    repository,
    restoreJobKey,
    restores, type SnapshotFile,
    snapshotFile, snapshotsMetadata, updateRepositorySchema, type UpdateRestoreSchema,
    updateRestoreSchema
} from "@backstream/shared";
import {and, eq, gte, lte} from "drizzle-orm";
import path from "node:path";
import { stream } from 'hono/streaming'
import {open, readFile} from "node:fs/promises";

const restoreRoute = new Hono<Env>()
    .post('/all-restores',
        zValidator('json', filterQuery),
        async (c) => {
            const filter = c.req.valid('json');
            const { start, end } = getTimeRange(filter);
            const dbResult = await c.var.db.select().from(restores)
                .where(and(
                    gte(restores.scheduledAt, start),
                    lte(restores.scheduledAt, end)
                ))
                .limit(filter.pageSize)
                .offset(filter.page - 1 > 0 ? filter.page - 1 : 0)
            if (!dbResult) return c.json({ error: 'query restores db error'}, 500);
            if (dbResult.length === 0) return c.json([]);
            const validated = updateRestoreSchema.array().parse(dbResult);
            return c.json(validated);
    })
    .post('/submit-restore',
        zValidator('json', snapshotFile),
        async (c) => {
            const validated = c.req.valid('json');
            // check if already restore
            const restore = await getRestoreBySnapshotFiles(c.var.db, validated);
            if (restore !== null) return c.json({ key: restore.id });
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, validated.repoId));
            const rs = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            // start restore
            const key = await rs.restoreSnapshotFile(validated);
            return c.json({ key: key });
        })
    .post('/check-restore-status/:id', async (c) => {
        const restoreId = Number(c.req.param('id'));
        const [dbResult] = await c.var.db.select().from(restores)
            .where(eq(restores.id, restoreId));
        if (!dbResult) return c.json({ message: 'Not found'}, 404);
        return c.json({
            status: dbResult.restoreStatus
        })
    })
    .get('/restore-log/:id', async (c) => {
        const restoreId = Number(c.req.param('id'))
        const restoreData = await getRestoreData(c.var.db, restoreId);
        if (!restoreData || !restoreData.executions || restoreData.executions.length === 0) return c.json({ message: 'Not found'}, 404);
        if (restoreData.restoreStatus === 'pending') return c.json([]);
        const exec = restoreData.executions[0];
        const logs = await getLogs(exec.logFile!, exec.errorFile!);
        return c.json(logs);
    })
    .on(['GET', 'HEAD'], '/download-restore-file', async (c) => {
        const key = Number(c.req.query('key'));
        const [restore] = await c.var.db.select().from(restores)
            .where(eq(restores.id, key));
        if (!restore) return c.json({ message: 'Not found'}, 404);
        // get restore file
        const filePath = restore.serverPath!;
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
        const [restore] = await c.var.db.select().from(restores)
            .where(eq(restores.id, restoreId));
        if (!restore) return c.json({ message: 'Not found' }, 404);
        // todo: 停止正在 restore 的 job
        await c.var.db.delete(restores).where(eq(restores.id, restoreId));
        return c.json({ success: true, restoreId });
    })

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

async function getRestoreBySnapshotFiles(db: Env['Variables']['db'], file: SnapshotFile) {
    const snapshot = await db.query.snapshotsMetadata.findFirst({
        where: (snapshotsMetadata, { and, eq }) => and(
            eq(snapshotsMetadata.repositoryId, file.repoId),
            eq(snapshotsMetadata.snapshotId, file.snapshotId),
        ),
        with: {
            restores: {
                where: (restores, { inArray }) =>
                    inArray(restores.restoreStatus, ['success', 'running', 'pending'])
            }
        }
    });
    if (!snapshot || !snapshot.restores || snapshot.restores.length === 0) return null;
    // check if restore file match
    for (const restore of updateRestoreSchema.array().parse(snapshot.restores)) {
        if (restore.files[0].path === file.path) return restore;
    }
    return null;
}

function getTimeRange(filter: FilterQuery) {
    const start = Math.max(0, filter.startTime ?? 0);
    let end = Date.now();
    if (filter.endTime !== undefined && filter.endTime !== 0) {
        end = filter.endTime;
    }
    return { start, end };
}

export default restoreRoute;