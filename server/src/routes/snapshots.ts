import {Hono} from 'hono';
import {type Env} from '../index'
import {
    backupTarget,
    execution,
    type FinishedSnapshotsMetaSchema,
    finishedSnapshotsMetaSchema,
    type OnGoingSnapshotsMetaSchema,
    repository, restoreJobKey, type ScheduledSnapshotsMetaSchema, snapshotFile,
    snapshotsMetadata,
    updateBackupPolicySchema, updateExecutionSchema,
    updateRepositorySchema,
    updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, desc, eq, inArray} from "drizzle-orm";
import type {ResticResult, Task} from "../service/restic";
import { readFile, open } from 'node:fs/promises';
import { stream } from 'hono/streaming'
import path from "node:path";


const snapshotsRoute = new Hono<Env>()
    .post('/all-snapshots',
        zValidator('json', updateBackupPolicySchema),
        async (c) => {
            const validated = c.req.valid('json');
            const firstTarget = validated.targets.sort((a, b) => a.index - b.index)[0];
            const result: {
                scheduleSnapshot: ScheduledSnapshotsMetaSchema[],
                onGoingSnapshot: OnGoingSnapshotsMetaSchema[],
                finishedSnapshot: FinishedSnapshotsMetaSchema[]
            } = {
                scheduleSnapshot: [],
                onGoingSnapshot: [],
                finishedSnapshot: []
            }
            // 查询 ongoing snapshot
            const [exec] = await c.var.db.select().from(execution)
                .where(and(
                    eq(execution.backupTargetId, firstTarget.id),
                    inArray(execution.executeStatus, ['running', 'pending'])
                ))
                .orderBy(desc(execution.scheduledAt))
                .limit(1)
            if (exec) {
                // 判断 exec 是 pending 还是 running
                const rs = await c.var.scheduler.getResticService(firstTarget.repository);
                const runningJob = rs.getRunningJob(updateExecutionSchema.parse(exec));
                if (runningJob === null) {
                    result.onGoingSnapshot.push({
                        executionId: exec.id,
                        uuid: exec.uuid,
                        status: 'pending',
                        createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                    })
                } else {
                    // 获取 progress
                    const progress = runningJob.getProgress()
                    // 获取 logs
                    const logs = await getLogs(runningJob);
                    result.onGoingSnapshot.push({
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
                        totalSize: progress.totalBytes || 0,
                    })
                }
            }
            // 查询 finished snapshots
            const allSnapshotsMetadata = await c.var.db.select().from(snapshotsMetadata)
                .where(and(
                    eq(snapshotsMetadata.repositoryId, firstTarget.repositoryId),
                    eq(snapshotsMetadata.path, validated.strategy.dataSource)))
            if (!allSnapshotsMetadata) {
                c.var.logger.warn('query finished snapshots db fail');
            } else {
                const manualConvertSnapshot = allSnapshotsMetadata.map(snapshot => ({
                    snapshotId: snapshot.snapshotId,
                    status: snapshot.snapshotStatus,
                    createdAtTimestamp: snapshot.time,
                    size: snapshot.size
                }));
                result.finishedSnapshot = finishedSnapshotsMetaSchema.array().parse(manualConvertSnapshot);
            }
            // 查询 schedule snapshot
            const [dbResult] = await c.var.db.select().from(backupTarget)
                .where(eq(backupTarget.id, firstTarget.id));
            result.scheduleSnapshot.push({
                uuid: '0',
                status: 'scheduled',
                createdAtTimestamp: dbResult?.nextBackupAt || firstTarget.nextBackupAt
            })
            return c.json(result);
        })
    .post('/files',
        zValidator('json', finishedSnapshotsMetaSchema),
        async (c) => {
            const validated = c.req.valid('json');
            const [snapshot] = await c.var.db.select().from(snapshotsMetadata)
                .where(eq(snapshotsMetadata.snapshotId, validated.snapshotId));
            if (!snapshot) return c.json({error: 'Not found'}, 404);
            const [repo] = await c.var.db.select().from(repository)
                .where(eq(repository.id, snapshot.repositoryId))
            // 查询 restic
            const rs = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            const result = await rs.getSnapshotFiles(updateSnapshotsMetadataSchema.parse(snapshot));
            if (!result.success) return c.json({error: result.error.toString()}, 500);
            if (result.result.length === 0) return c.json([]);
            return c.json(result.result.map(node => snapshotFile.parse({
                snapshotId: snapshot.snapshotId,
                repoId: repo.id,
                name: node.name,
                type: node.type,
                size: node.size || 0, // 0 for dir
                mtime: node.mtime,
                path: node.path,
            })))
        })
    .post('/submit-restore',
        zValidator('json', snapshotFile),
        async (c) => {
            const validated = c.req.valid('json');
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, validated.repoId));
            const rs = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            // start restore
            const key = await rs.restoreSnapshotFile(validated);
            return c.json(key);
        })
    .post('/check-restore-status',
        zValidator('json', restoreJobKey),
        async (c) => {
            const validated = c.req.valid('json');
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, validated.repoId));
            const rs = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            // check restore status
            const result = rs.checkRestoreStatus(validated);
            return c.json(result);
        })
    .on(['GET', 'HEAD'], '/restore-file',
        async (c) => {
            const key = c.req.query('key');
            if (!key) return c.json({error: 'Query Key is empty'}, 404);
            const validated = restoreJobKey.parse(JSON.parse(key));
            const [repo] = await c.var.db.select().from(repository).where(eq(repository.id, validated.repoId));
            const rs = await c.var.scheduler.getResticService(updateRepositorySchema.parse(repo));
            // get restore file
            const filePath = rs.getRestoreFile(validated);
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

export default snapshotsRoute;