import { Hono } from 'hono';
import {type Activity, execution, repository, sameDriveRepoRequest, updateRepositorySchema} from "@backstream/shared";
import {type Env} from '../index'
import path from "node:path";
import { promises as fs } from 'fs'
import {FileManager} from "../service/backup-manager/file-manager";
import {zValidator} from "@hono/zod-validator";
import {eq, inArray} from "drizzle-orm";
import {getLogs} from "./utils";

const infoRoute = new Hono<Env>()
    .get('/health', (c) => c.json({ message:'OK'}))
    .get('/activity', async (c) => {
        const dbResult = await getExecutionsData(c.var.db);
        if (!dbResult) return c.json({ error: 'db error'}, 500);
        const result: Activity[] = dbResult.map(item => ({
            id: item.id,
            title: item.commandType,
            description: `Performed ${item.commandType} on ${item.repository ? item.repository.name : item.target?.strategy.name}(${item.executeStatus})`,
            completeAt: item.finishedAt ? item.finishedAt : 0,
            level: item.executeStatus === "fail" ? "ALERT" : "INFO",
        }))
        return c.json(result);
    })
    .get('/stats', async (c) => {
        const dbResult = await c.var.db.query.strategy.findMany({
            with: {
                targets: {
                    with: {
                        // Fetch only the single latest backup finished execution
                        executions: {
                            columns: {
                                executeStatus: true,
                                finishedAt: true,
                            },
                            where: (execution, { and, eq }) => and(
                                eq(execution.commandType, 'backup'),
                            ),
                            orderBy: (execution, { desc }) => [desc(execution.finishedAt)],
                            limit: 1,
                        },
                    },
                },
            },
        });
        if (!dbResult) return c.json({ error: 'db error' }, 500);
        let totalSize = 0, failStrategy = 0;
        dbResult.forEach(item => {
            totalSize += item.dataSourceSize;
            const hasFailedTarget = item.targets.some((target) => {
                const latestExecution = target.executions[0]; // limit: 1 ensures this is the latest
                return latestExecution?.executeStatus === 'fail';
            });
            if (hasFailedTarget) failStrategy++;
        })
        return c.json({
            activeCount: dbResult.length,
            totalSize: totalSize,
            successRate: dbResult.length > 0 ?
                (dbResult.length - failStrategy) / dbResult.length
                : 0
        });
    })
    .get('/path-suggestion', async (c) => {
        const { path: queryPath = '/', type, caseSensitive } = c.req.query();
        const safeQueryPath = queryPath && queryPath.trim() !== '' ? queryPath : '/';
        const isCS = caseSensitive === 'true';

        try {
            const fullPath = path.resolve('/', safeQueryPath);
            // Determine if we are inside a directory or matching a prefix
            const isDir = (await fs.stat(fullPath).catch(() => null))?.isDirectory() && safeQueryPath.endsWith('/');
            const dir = isDir ? fullPath : path.dirname(fullPath);
            const term = isDir ? '' : path.basename(fullPath);

            const entries = await fs.readdir(dir, { withFileTypes: true });

            const results = entries
                .filter(e => (!type || (type === 'dir' ? e.isDirectory() : e.isFile())) &&
                    e.name.toLowerCase().includes(term.toLowerCase()))
                .map(e => ({
                    fullPath: path.join(dir, e.name),
                    name: e.name,
                    type: e.isDirectory() ? 'dir' : 'file',
                    dist: term ? getLevenshteinDistance(isCS ? term : term.toLowerCase(), isCS ? e.name : e.name.toLowerCase()) : 0
                }))
                .sort((a, b) => a.dist - b.dist)

            return c.json({ results });
        } catch {
            return c.json({ error: 'Not found' }, 404);
        }
    })
    .post('/same-drive-repo',
        zValidator('json', sameDriveRepoRequest),
        async (c) => {
            const validated = c.req.valid('json');
            const result: number[] = [];
            if (validated.repoIds.length === 0) return c.json(result);
            const dbResult = await c.var.db.select().from(repository)
                .where(inArray(repository.id, validated.repoIds))
            if (dbResult.length === 0) return c.json(result);
            for (const repo of dbResult) {
                const repoValid = updateRepositorySchema.parse(repo);
                if (repoValid.repositoryType !== 'LOCAL') continue;
                if (await FileManager.isSameDrive(validated.dataSource, repoValid.path)) result.push(repo.id)
            }
            return c.json(result);
    })
    // get fail log by execution id
    .get('/fail-history-log/:id', async (c) => {
        const executionId = Number(c.req.param('id'));
        const [exec] = await c.var.db.select().from(execution)
            .where(eq(execution.id, executionId));
        if (!exec) return c.json({ message: 'Not found' }, 404);
        return c.json({
            logs: await getLogs(exec.logFile)
        })
    })

async function getExecutionsData(db: Env['Variables']['db']) {
    return await db.query.execution.findMany({
        orderBy: (execution, { desc }) => [desc(execution.finishedAt)],
        limit: 5,
        with: {
            target: {
                with: {
                    strategy: true
                }
            },
            repository: true,
        },
    });
}

function getLevenshteinDistance(a: string, b: string): number {
    const tmp = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) tmp[0][i] = i;
    for (let j = 0; j <= b.length; j++) tmp[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
            tmp[j][i] = Math.min(tmp[j - 1][i] + 1, tmp[j][i - 1] + 1, tmp[j - 1][i - 1] + substitutionCost);
        }
    }
    return tmp[b.length][a.length];
}

export default infoRoute;
