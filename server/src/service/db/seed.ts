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
    // turn off foreign key CONSTRAINT for seeding
    db.run(`PRAGMA foreign_keys = OFF;`)
    await db.delete(execution);
    await db.delete(snapshotsMetadata);
    await db.delete(backupTarget);
    await db.delete(strategy);
    await db.delete(repository);
    await db.delete(setting);
    db.run(`PRAGMA foreign_keys = ON;`)

    // 插入 Repository 数据
    console.log("🌱 Seeding started...");
    const repositories = await db
        .insert(repository)
        .values([
            {
                name: "主备份仓库",
                path: "/home/nopepsi-lenovo-laptop/backstream/server/src/test/local-repo",
                password: "0608",
                repositoryType: RepoType.LOCAL,
                repositoryStatus: "Active",
                checkSchedule: "manual",
                checkPercentage: 0.2,
                pruneSchedule: "manual",
            },
            {
                name: "云备份仓库",
                path: "s3://my-backup-bucket",
                password: "encrypted_password_456",
                repositoryType: RepoType.S3,
                certification: {
                    AWS_ACCESS_KEY_ID: "DSAEF",
                    AWS_SECRET_ACCESS_KEY: "XVDSAE",
                },
                repositoryStatus: "Corrupt",
                checkSchedule: "manual",
                checkPercentage: 0.2,
                nextCheckAt: 1770967868630,
                pruneSchedule: "manual",
                nextPruneAt: 1770967868630
            },
            {
                name: "归档仓库",
                path: "/home/nopepsi-lenovo-laptop/backstream/server/src/test/second-repo",
                password: "0608",
                repositoryType: RepoType.LOCAL,
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

    // 插入 Setting 数据
    await db.insert(setting).values([
        {
            ioPriority: "normal",
            minDiskSpaceGB: 10,
            email: "admin@example.com",
            logRetentionDays: 7,
        },
    ]);

    console.log("✅ Seeding completed!");
    process.exit(0); // 👈 Critical for SQLite/Better-SQLite3 scripts
}

main().catch((err) => {
    console.error("❌ Seeding error:", err);
    process.exit(1);
});