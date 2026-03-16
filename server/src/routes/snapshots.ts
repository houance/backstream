import {Hono} from 'hono';
import {type Env} from '../index'
import {
    backupTarget,
    filterQuery, type FilterQuery,
    type FinishedSnapshotsMetaSchema,
    finishedSnapshotsMetaSchema,
    repository, snapshotFile,
    snapshotsMetadata, updateBackupTargetSchema,
    updateRepositorySchema,
    updateSnapshotsMetadataSchema
} from "@backstream/shared";
import {zValidator} from "@hono/zod-validator";
import {and, eq, gte, lte, count} from "drizzle-orm";
import { z } from "zod";


const snapshotsRoute = new Hono<Env>()
    .post('/all-snapshots',
        zValidator('json', z.object({
            targetId: z.number().positive(),
            filterQuery: filterQuery
        })),
        async (c) => {
            const validated = c.req.valid('json');
            // get start and end time range
            const filter = validated.filterQuery;
            const {start, end} = getTimeRange(filter);
            const targetId = validated.targetId;
            // get policy
            const policy = await getPolicyByTargetId(c.var.db, targetId);
            if (policy === undefined || policy.targets.length === 0) return c.json({ message: 'Not found'}, 404);
            const target = updateBackupTargetSchema.parse(policy.targets[0]);
            const result: {
                finishedSnapshot: FinishedSnapshotsMetaSchema[],
                totalFinishedCount: number
            } = {
                finishedSnapshot: [],
                totalFinishedCount: 0
            };
            // 查询 finished snapshots
            const [allSnapshotsMetadata, totalCountResult] = await Promise.all([
                c.var.db.select().from(snapshotsMetadata)
                    .where(and(
                        eq(snapshotsMetadata.repositoryId, target.repositoryId),
                        eq(snapshotsMetadata.path, policy.dataSource),
                        gte(snapshotsMetadata.time, start),
                        lte(snapshotsMetadata.time, end)
                    ))
                    .limit(filter.pageSize)
                    .offset(filter.page - 1 < 0 ? 0 : filter.page - 1),
                c.var.db.select({ count: count() }).from(snapshotsMetadata)
                    .where(and(
                        eq(snapshotsMetadata.repositoryId, target.repositoryId),
                        eq(snapshotsMetadata.path, policy.dataSource),
                        gte(snapshotsMetadata.time, start),
                        lte(snapshotsMetadata.time, end)
                    ))
            ])
            if (!allSnapshotsMetadata || !totalCountResult) {
                c.var.logger.warn('query finished snapshots db fail');
                return c.json({ error: 'Query db fail' }, 500);
            } else {
                const manualConvertSnapshot = allSnapshotsMetadata.map(snapshot => ({
                    snapshotId: snapshot.snapshotId,
                    status: snapshot.snapshotStatus,
                    createdAtTimestamp: snapshot.time,
                    size: snapshot.size
                }));
                result.finishedSnapshot = finishedSnapshotsMetaSchema.array().parse(manualConvertSnapshot);
                result.totalFinishedCount = totalCountResult[0].count;
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
                snapshotId: snapshot.snapshotId,
                repoId: repo.id,
                name: node.name,
                type: node.type,
                size: node.size || 0, // 0 for dir
                mtime: node.mtime,
                path: node.path,
            })))
        })

async function getPolicyByTargetId(db: Env['Variables']['db'], targetId: number) {
    return await db.query.strategy.findFirst({
        // 1. Filter the main strategy record based on the targetId
        where: (strategy, { exists, and, eq }) =>
            exists(
                db.select()
                    .from(backupTarget) // Replace with your actual table variable name
                    .where(and(
                        eq(backupTarget.backupStrategyId, strategy.id),
                        eq(backupTarget.id, targetId)
                    ))
            ),
        // 2. Keep your 'with' to fetch the nested data
        with: {
            targets: {
                where: (backupTarget, { eq }) => eq(backupTarget.id, targetId),
            },
        },
    });
}

function getTimeRange(filter: FilterQuery) {
    const start = Math.max(0, filter.startTime ?? 0);
    let end = Date.now();
    if (filter.endTime !== undefined && filter.endTime !== 0) {
        end = filter.endTime;
    }
    return { start, end };
}

export default snapshotsRoute;