import {Hono} from 'hono';
import {type Env} from '../index'
import {
    execution,
    type FinishedSnapshotsMetaSchema,
    finishedSnapshotsMetaSchema,
    type OnGoingSnapshotsMetaSchema,
    repository, snapshotFile,
    snapshotsMetadata,
    updateBackupPolicySchema, updateExecutionSchema,
    updateRepositorySchema,
    updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, desc, eq, inArray} from "drizzle-orm";

const snapshotsRoute = new Hono<Env>()
    .post('/all-snapshots',
        zValidator('json', updateBackupPolicySchema),
        async (c) => {
            const validated = c.req.valid('json');
            const firstTarget = validated.targets.sort((a, b) => a.index - b.index)[0];
            const result: {
                onGoingSnapshot: OnGoingSnapshotsMetaSchema[],
                finishedSnapshot: FinishedSnapshotsMetaSchema[]
            } = {
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
                // 获取 progress
                const rs = await c.var.scheduler.getResticService(firstTarget.repository);
                const runningJob = rs.getRunningJob(updateExecutionSchema.parse(exec));
                if (runningJob === null) {
                    result.onGoingSnapshot.push({
                        uuid: exec.uuid,
                        status: 'pending',
                        createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                    })
                } else {
                    // 获取 progress
                    const progress = runningJob.getProgress()
                    result.onGoingSnapshot.push({
                        uuid: exec.uuid,
                        status: 'running',
                        createdAtTimestamp: exec.startedAt || exec.scheduledAt,
                        progress: {
                            percent: `${progress.percentDone * 100}%`,
                            bytesDone: progress.bytesDone,
                            totalBytes: progress.totalBytes,
                            logs: ['not supported']
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
                console.warn('query finished snapshots db fail');
            } else {
                const manualConvertSnapshot = allSnapshotsMetadata.map(snapshot => ({
                    snapshotId: snapshot.snapshotId,
                    status: snapshot.snapshotStatus,
                    createdAtTimestamp: snapshot.time,
                    size: snapshot.size
                }));
                result.finishedSnapshot = finishedSnapshotsMetaSchema.array().parse(manualConvertSnapshot);
            }
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
                name: node.name,
                type: node.type,
                size: node.size || 0, // 0 for dir
                mtime: node.mtime,
                path: node.path,
            })))
        })

export default snapshotsRoute;