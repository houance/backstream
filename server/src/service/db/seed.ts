import { db } from "./index";
import {
    repository,
    strategy,
    backupTarget,
    snapshotsMetadata,
    execution,
    setting,
    RepoType,
    StrategyType,
    RetentionType,
    WindowType
} from "@backstream/shared";


const now = () => Math.floor(Date.now());
const daysAgo = (days: number) => now() - days * 24 * 60 * 60;

async function main() {
    console.log("🗑️ Resetting database...");
    // 1. 首先清空所有表（注意外键约束顺序）
    console.log("清空现有数据...");
    await db.delete(execution);
    await db.delete(snapshotsMetadata);
    await db.delete(backupTarget);
    await db.delete(strategy);
    await db.delete(repository);
    await db.delete(setting);

    // 2. 插入 Repository 数据
    console.log("🌱 Seeding started...");
    const repositories = await db
        .insert(repository)
        .values([
            {
                name: "主备份仓库",
                path: "/home/nopepsi-dev/fullstack-project/backstream/server/src/test/local-repo",
                password: "0608",
                repositoryType: RepoType.LOCAL,
                usage: 5368709120, // 5GB
                capacity: 10737418240, // 10GB
                repositoryStatus: "Active",
                checkSchedule: "* * 0 * * *",
                checkPercentage: 0.2,
                nextCheckAt: 0,
                pruneSchedule: "* * 0 * * *",
                nextPruneAt: 0
            },
            {
                name: "云备份仓库",
                path: "s3://my-backup-bucket",
                password: "encrypted_password_456",
                repositoryType: RepoType.S3,
                usage: 2147483648, // 2GB
                capacity: 5368709120, // 5GB
                certification: {
                    AWS_ACCESS_KEY_ID: "DSAEF",
                    AWS_SECRET_ACCESS_KEY: "XVDSAE",
                },
                repositoryStatus: "Disconnected",
                checkSchedule: "manual",
                checkPercentage: 0.2,
                nextCheckAt: 1770967868630,
                pruneSchedule: "manual",
                nextPruneAt: 1770967868630
            },
            {
                name: "归档仓库",
                path: "/home/nopepsi-dev/fullstack-project/backstream/server/src/test/second-repo",
                password: "0608",
                repositoryType: RepoType.LOCAL,
                usage: 3221225472, // 3GB
                capacity: 10737418240, // 10GB
                repositoryStatus: "Active",
                checkSchedule: "manual",
                checkPercentage: 0.2,
                nextCheckAt: 1770967868630,
                pruneSchedule: "manual",
                nextPruneAt: 1770967868630
            },
        ])
        .returning();

    const [repo1, repo2, repo3] = repositories;

    // 3. 插入 Strategy 数据
    const strategies = await db
        .insert(strategy)
        .values([
            {
                name: "完整服务器备份",
                hostname: "server1.example.com",
                dataSource: "/home/nopepsi-dev/rclone-v1.70.3-linux-amd64",
                dataSourceSize: 21474836480, // 20GB
                strategyType: StrategyType.STRATEGY_321,
            },
            {
                name: "数据库每日备份",
                hostname: "db.example.com",
                dataSource: "/var/lib/postgresql",
                dataSourceSize: 5368709120, // 5GB
                strategyType: StrategyType.LOCAL_BACKUP,
            },
            {
                name: "文档备份",
                hostname: "nas.example.com",
                dataSource: "/shared/docs",
                dataSourceSize: 10737418240, // 10GB
                strategyType: StrategyType.LOCAL_BACKUP,
            },
        ])
        .returning();

    const [strategy1, strategy2, strategy3] = strategies;

    // 4. 插入 BackupTarget 数据（连接策略和仓库）
    const backupTargets = await db
        .insert(backupTarget)
        .values([
            {
                backupStrategyId: strategy1.id,
                repositoryId: repo1.id,
                retentionPolicy: {
                    type: RetentionType.count,
                    windowType: WindowType.last,
                    countValue: "123"
                },
                schedulePolicy: "*/30 * * * * *",
                nextBackupAt: 1770969043979,
                index: 1,
            },
            {
                backupStrategyId: strategy2.id,
                repositoryId: repo1.id,
                retentionPolicy: {
                    type: RetentionType.duration,
                    windowType: WindowType.hourly,
                    durationValue: "1y2m3d"
                },
                schedulePolicy: "* * 0 * * *",
                nextBackupAt: 1770969043979,
                index: 1,
            },
            {
                backupStrategyId: strategy3.id,
                repositoryId: repo2.id,
                retentionPolicy: {
                    type: RetentionType.count,
                    windowType: WindowType.last,
                    countValue: "123"
                },
                schedulePolicy: "* * 0 * * *",
                nextBackupAt: 1770969043979,
                index: 1,
            },
            {
                backupStrategyId: strategy1.id,
                repositoryId: repo3.id,
                retentionPolicy: {
                    type: RetentionType.count,
                    windowType: WindowType.last,
                    countValue: "1"
                },
                schedulePolicy: "* 0 * * * *",
                nextBackupAt: 1770969043979,
                index: 2,
            },
        ])
        .returning();

    const [target1, target2, target3, target4] = backupTargets;

    // 5. 插入 SnapshotsMetadata 数据
    await db.insert(snapshotsMetadata).values([
        {
            repositoryId: repo1.id,
            path: "/mnt/backups/primary/snapshots/server1",
            snapshotId: "abc123def456",
            hostname: "server1.example.com",
            username: "backup-user",
            uid: 1000,
            gid: 1000,
            excludes: ['.cls', '.xls', 'txt'],
            tags: ['success', 'production'],
            programVersion: '0.18.0',
            time: daysAgo(1),
            snapshotStatus: "success",
            snapshotSummary: {
                backupStart: now(), // Coerced & transformed to number
                backupEnd: now(),           // Coerced & transformed to number
                filesNew: 10,
                filesChanged: 5,
                filesUnmodified: 100,
                dirsNew: 2,
                dirsChanged: 1,
                dirsUnmodified: 20,
                dataBlobs: 150,
                treeBlobs: 30,
                dataAdded: 1024576,
                dataAddedPacked: 512288,
                totalFilesProcessed: 115,
                totalBytesProcessed: 5000000,
                snapshotId: "abc123def456",
            }
        },
        {
            repositoryId: repo1.id,
            path: "/mnt/backups/primary/snapshots/db",
            snapshotId: "ghi789jkl012",
            hostname: "server1.example.com",
            username: "backup-user",
            uid: 1000,
            gid: 1000,
            excludes: ['.cls', '.xls', 'txt'],
            tags: ['success', 'production'],
            programVersion: '0.18.0',
            time: daysAgo(1),
            snapshotStatus: "success",
            snapshotSummary: {
                backupStart: now(), // Coerced & transformed to number
                backupEnd: now(),           // Coerced & transformed to number
                filesNew: 10,
                filesChanged: 5,
                filesUnmodified: 100,
                dirsNew: 2,
                dirsChanged: 1,
                dirsUnmodified: 20,
                dataBlobs: 150,
                treeBlobs: 30,
                dataAdded: 1024576,
                dataAddedPacked: 512288,
                totalFilesProcessed: 115,
                totalBytesProcessed: 5000000,
                snapshotId: "ghi789jkl012",
            }
        },
        {
            repositoryId: repo2.id,
            path: "s3://my-backup-bucket/docs",
            snapshotId: "mno345pqr678",
            hostname: "server1.example.com",
            username: "backup-user",
            uid: 1000,
            gid: 1000,
            excludes: ['.cls', '.xls', 'txt'],
            tags: ['success', 'production'],
            programVersion: '0.18.0',
            time: daysAgo(1),
            snapshotStatus: "success",
            snapshotSummary: {
                backupStart: now(), // Coerced & transformed to number
                backupEnd: now(),           // Coerced & transformed to number
                filesNew: 10,
                filesChanged: 5,
                filesUnmodified: 100,
                dirsNew: 2,
                dirsChanged: 1,
                dirsUnmodified: 20,
                dataBlobs: 150,
                treeBlobs: 30,
                dataAdded: 1024576,
                dataAddedPacked: 512288,
                totalFilesProcessed: 115,
                totalBytesProcessed: 5000000,
                snapshotId: "mno345pqr678",
            }
        },
        {
            repositoryId: repo1.id,
            path: "/mnt/backups/primary/snapshots/server1-failed",
            snapshotId: "stu901vwx234",
            hostname: "server1.example.com",
            username: "backup-user",
            uid: 1000,
            gid: 1000,
            excludes: ['.cls', '.xls', 'txt'],
            tags: ['success', 'production'],
            programVersion: '0.18.0',
            time: daysAgo(1),
            snapshotStatus: "partial",
            snapshotSummary: {
                backupStart: now(), // Coerced & transformed to number
                backupEnd: now(),           // Coerced & transformed to number
                filesNew: 10,
                filesChanged: 5,
                filesUnmodified: 100,
                dirsNew: 2,
                dirsChanged: 1,
                dirsUnmodified: 20,
                dataBlobs: 150,
                treeBlobs: 30,
                dataAdded: 1024576,
                dataAddedPacked: 512288,
                totalFilesProcessed: 115,
                totalBytesProcessed: 5000000,
                snapshotId: "stu901vwx234",
            }
        },
    ]);

    // 6. 插入 Execution 数据
    await db.insert(execution).values([
        {
            uuid: "550e8400-e29b-41d4-a716-446655440000",
            logFile: "/var/log/backups/backup-2024-01-15.log",
            errorFile: null,
            commandType: "backup",
            fullCommand: "restic backup /etc /home /var/www",
            exitCode: 0,
            scheduledAt: daysAgo(1) - 300, // 计划在开始前5分钟
            startedAt: daysAgo(1),
            finishedAt: daysAgo(1) + 3600,
            executeStatus: "success",
            strategyId: strategy1.id,
            backupTargetId: target1.id,
        },
        {
            uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
            logFile: "/var/log/backups/prune-2024-01-14.log",
            errorFile: null,
            commandType: "prune",
            fullCommand: "restic forget --keep-daily 7 --prune",
            exitCode: 0,
            scheduledAt: daysAgo(2),
            startedAt: daysAgo(2) + 60,
            finishedAt: daysAgo(2) + 1200,
            executeStatus: "success",
            repositoryId: repo1.id,
            strategyId: null,
            backupTargetId: null,
        },
        {
            uuid: "6ba7b811-9dad-11d1-80b4-00c04fd430c9",
            logFile: "/var/log/backups/backup-2024-01-15-db.log",
            errorFile: null,
            commandType: "backup",
            fullCommand: "restic backup /var/lib/postgresql",
            exitCode: 0,
            scheduledAt: daysAgo(0.5) - 300,
            startedAt: daysAgo(0.5),
            finishedAt: daysAgo(0.5) + 1800,
            executeStatus: "success",
            strategyId: strategy2.id,
            backupTargetId: target2.id,
        },
        {
            uuid: "6ba7b812-9dad-11d1-80b4-00c04fd430c0",
            logFile: "/var/log/backups/backup-2024-01-08.log",
            errorFile: null,
            commandType: "backup",
            fullCommand: "restic backup /shared/docs",
            exitCode: 0,
            scheduledAt: daysAgo(7),
            startedAt: daysAgo(7),
            finishedAt: daysAgo(7) + 7200,
            executeStatus: "success",
            strategyId: strategy3.id,
            backupTargetId: target3.id,
        },
        {
            uuid: "6ba7b813-9dad-11d1-80b4-00c04fd430c1",
            logFile: "/var/log/backups/backup-failed-2024-01-15.log",
            errorFile: "/var/log/backups/backup-failed-2024-01-15.err",
            commandType: "backup",
            fullCommand: "restic backup /etc /home /var/www",
            exitCode: 1,
            scheduledAt: daysAgo(0.25) - 300,
            startedAt: daysAgo(0.25),
            finishedAt: daysAgo(0.25) + 600,
            executeStatus: "fail",
            strategyId: strategy1.id,
            backupTargetId: target1.id,
        },
        {
            uuid: "6ba7b814-9dad-11d1-80b4-00c04fd430c2",
            logFile: null,
            errorFile: null,
            commandType: "backup",
            fullCommand: "restic backup /etc /home /var/www",
            exitCode: null,
            scheduledAt: now() + 3600, // 1小时后
            startedAt: null,
            finishedAt: null,
            executeStatus: "pending",
            strategyId: strategy1.id,
            backupTargetId: target1.id,
        },
    ]);

    // 7. 插入 Setting 数据
    await db.insert(setting).values([
        {
            ioPriority: "normal",
            minDiskSpaceGB: 10,
            email: "admin@example.com",
            logRetentionDays: 90,
        },
    ]);

    console.log("✅ Seeding completed!");
    process.exit(0); // 👈 Critical for SQLite/Better-SQLite3 scripts
}

main().catch((err) => {
    console.error("❌ Seeding error:", err);
    process.exit(1);
});