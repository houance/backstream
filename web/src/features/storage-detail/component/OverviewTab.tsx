import {ActionIcon, Badge, Box, Divider, Group, Paper, SimpleGrid, Stack, Switch, Text, Tooltip} from "@mantine/core";
import {type ReactNode} from "react";
import {
    NEVER_CRON,
    scheduleStatus,
    type ScheduleStatus,
    type UpdateRepoScheduleSchema,
    type UpdateRepositorySchema
} from "@backstream/shared";
import {calPercentage, formatBytes, formatTimestamp} from "../../../util/format.ts";
import {IconAlertCircle, IconPlayerPlay} from "@tabler/icons-react";

export function OverviewTab({ storage }: {
    storage: {
        repo: UpdateRepositorySchema,
        statJob: UpdateRepoScheduleSchema,
        snapshotsJob: UpdateRepoScheduleSchema,
        snapshotCount: number,
        snapshotSize: number,
        checkJob: UpdateRepoScheduleSchema,
        pruneJob: UpdateRepoScheduleSchema,
        lastCheckTimestamp: number | null,
        lastPruneTimestamp: number | null,
    }
}) {
    const repo = storage.repo;
    return (
        <Stack pt="md" gap="xl">
            <StorageHeader repo={storage.repo}/>

            {/* Content Grid - Clean Monochrome Style */}
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                <JobCard title="Storage" job={storage.statJob} >
                    <DetailRow label="Disk Usage" value={formatBytes(repo.size)}/>
                    <DetailRow
                        label="Efficiency"
                        value={calPercentage(repo.size, storage.snapshotSize, true) + ` (${formatBytes(storage.snapshotSize - (repo.size ?? 0))} Saved)`} />
                </JobCard>

                <JobCard title="Index" job={storage.snapshotsJob} >
                    <DetailRow label="Snapshots" value={storage.snapshotCount}/>
                    <DetailRow label="Total Blobs" value={repo.blobCount}/>
                </JobCard>

                <JobCard title="Check" job={storage.checkJob} >
                    <DetailRow label="Last Run" value={formatTimestamp(storage.lastCheckTimestamp)} />
                </JobCard>

                <JobCard title="Prune" job={storage.pruneJob} >
                    <DetailRow label="Last Run" value={formatTimestamp(storage.lastPruneTimestamp)} />
                </JobCard>
            </SimpleGrid>
        </Stack>
    );
}

function StorageHeader({ repo }: { repo: UpdateRepositorySchema }) {
    const getStatusUI = () => {
        if (repo.linkStatus === 'UP' && repo.healthStatus === 'HEALTH') return { label: 'HEALTH', color: 'green' };
        if (repo.linkStatus === 'UP' && repo.healthStatus === 'INITIALIZING') return { label: 'INITIALIZING', color: 'yellow' };
        return { label: repo.linkStatus === 'DOWN' ? 'DOWN' : repo.healthStatus, color: 'red' };
    }
    const status = getStatusUI();

    return (
        <Paper
            withBorder
            px="xl"
            py="md"
            radius="md"
            bg="var(--mantine-color-blue-light)"
            style={{ borderLeft: '4px solid var(--mantine-color-blue-filled)' }}
        >
            <Group justify="space-between" align="center">

                {/* Left & Center Sections */}
                <Group gap={40} align="center">
                    {/* Primary Name Section */}
                    <Stack gap={2}>
                        <Text size="xs" c="blue" fw={700} tt="uppercase" lts={1}>
                            Repository
                        </Text>
                        <Text fw={800} size="lg" style={{ lineHeight: 1 }}>
                            {repo.name}
                        </Text>
                    </Stack>

                    {/* Metadata Section with Divider */}
                    <Box style={{ borderLeft: '1px solid var(--mantine-color-blue-outline)', paddingLeft: '40px' }}>
                        <Group gap="xl">
                            <Stack gap={0}>
                                <Text size="xs" c="dimmed" fw={500}>Path</Text>
                                <Text fw={700} size="sm">{repo.path}</Text>
                            </Stack>

                            <Stack gap={0}>
                                <Text size="xs" c="dimmed" fw={500}>Type</Text>
                                <Text fw={700} size="sm">{repo.repositoryType}</Text>
                            </Stack>

                            <Stack gap={0}>
                                <Text size="xs" c="dimmed" fw={500}>Restic Version</Text>
                                <Text fw={700} size="sm">V{repo.version}</Text>
                            </Stack>
                        </Group>
                    </Box>
                </Group>

                {/* Right Section: Status */}
                <Stack gap={4} align="flex-end">
                    <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts={0.5}>Status</Text>
                    <Badge
                        variant="filled"
                        color={status.color}
                        size="md"
                        radius="sm"
                        style={{ height: 24 }}
                    >
                        {status.label}
                    </Badge>
                </Stack>

            </Group>
        </Paper>
    );
}

const JobCard = ({ title, job, children }: {
    title: string;
    job: UpdateRepoScheduleSchema;
    children: ReactNode;
}) => {
    // helper outside
    const getJobUI = (status: ScheduleStatus) => {
        switch (status) {
            case scheduleStatus.ACTIVE:
                return { label: 'Scheduler ON', color: 'blue', icon: null };
            case scheduleStatus.ERROR:
                return { label: 'Scheduler ERROR', color: 'red', icon: <IconAlertCircle size={14} color="red" /> };
            case scheduleStatus.PAUSED:
            default:
                return { label: 'Scheduler OFF', color: 'gray', icon: null };
        }
    };
    const jobUI = getJobUI(job.jobStatus);
    const isRunning = job.jobStatus === 'ACTIVE';

    return (
        <Paper withBorder p="md" radius="md" shadow="sm" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Stack gap='sm' style={{ height: '100%', flex: 1 }}>
                <Group justify="space-between" wrap="nowrap" align='center'>
                    <Badge variant="light" color="indigo" mb="sm">{title}</Badge>
                    <Tooltip label="Run Now">
                        <ActionIcon variant="light" color="blue" size="sm" onClick={() => {}}>
                            <IconPlayerPlay size={14} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Divider />

                <Stack gap="xs" style={{ flex: 1 }}>
                    <DetailRow
                        label="Schedule"
                        value={<Text size="sm" ff="monospace">{job.cron === NEVER_CRON ? 'Manual' : job.cron}</Text>}
                    />
                    {children}
                </Stack>

                {/* Quick Toggle for active status at bottom */}
                <Group
                    justify="space-between"
                    mt="auto"
                    pt="sm"
                    style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                    <Group gap={6}>
                        {jobUI.icon}
                        <Text size="xs" fw={700} c={jobUI.color} style={{ textTransform: 'uppercase' }}>
                            {jobUI.label}
                        </Text>
                    </Group>

                    <Switch
                        checked={isRunning}
                        size="xs"
                        color="green"
                        // Toggle logic: If currently ACTIVE, set to PAUSED.
                        // If currently PAUSED or ERROR, set to ACTIVE.
                        onChange={() => {/* toggleStatus(target.id, isRunning ? "PAUSED" : "ACTIVE") */}}
                    />
                </Group>
            </Stack>
        </Paper>
    );
};

// 3. Main component remains clean
export function StorageCards({ storage }: {
    storage: {
        repo: UpdateRepositorySchema,
        statJob: UpdateRepoScheduleSchema,
        snapshotsJob: UpdateRepoScheduleSchema,
        snapshotCount: number,
        snapshotSize: number,
        checkJob: UpdateRepoScheduleSchema,
        pruneJob: UpdateRepoScheduleSchema,
        lastCheckTimestamp: number | null,
        lastPruneTimestamp: number | null,
    }}) {

    const { repo } = storage;

    return (
        <>
            <JobCard title="Storage" job={storage.statJob} >
                <DetailRow label="Disk Usage" value={formatBytes(repo.size)}/>
                <DetailRow label="Efficiency" value={calPercentage(repo.size, storage.snapshotSize, true)}/>
            </JobCard>

            <JobCard title="Index" job={storage.snapshotsJob} >
                <DetailRow label="Snapshots" value={storage.snapshotCount}/>
                <DetailRow label="Total Blobs" value={repo.blobCount}/>
            </JobCard>

            <JobCard title="Check" job={storage.checkJob} >
                <DetailRow label="Last Run" value={formatTimestamp(storage.lastCheckTimestamp)} />
            </JobCard>

            <JobCard title="Prune" job={storage.pruneJob} >
                <DetailRow label="Last Run" value={formatTimestamp(storage.lastPruneTimestamp)} />
            </JobCard>
        </>
    );
}

function DetailRow({
                       label,
                       value,
                       isMonospace
                   }: {
    label: string;
    value: ReactNode; // Changed from string to ReactNode
    isMonospace?: boolean
}) {
    return (
        <Group justify="apart" wrap="nowrap">
            <Text size="sm" fw={500}>{label}:</Text>
            {/* If value is a string, wrap it in Text; otherwise, render it directly */}
            {['string', 'number'].includes(typeof value) ? (
                <Text size="sm" c="dimmed" ff={isMonospace ? 'monospace' : undefined}>
                    {value}
                </Text>
            ) : (
                value
            )}
        </Group>
    );
}
