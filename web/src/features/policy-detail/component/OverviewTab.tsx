import {
    Badge,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
    ActionIcon,
    Divider,
    Box,
    Switch,
    Loader
} from "@mantine/core";
import {
    type ScheduleStatus,
    scheduleStatus,
    type UpdateBackupPolicySchema,
    type UpdateRepositorySchema
} from "@backstream/shared";
import {formatBytes, formatRetentionPolicy, formatTimestamp} from "../../../util/format.ts";
import type {ReactNode} from "react";
import {IconAlertCircle, IconClock, IconPlayerPlay} from "@tabler/icons-react";

export function OverviewTab({
                                policy,
                                onScheStatusChange,
                                isScheStatusPending = false
}: {
    policy: UpdateBackupPolicySchema,
    onScheStatusChange: ({ jobId, status }: { jobId: number, status: 'pause' | 'resume' | 'trigger'}) => Promise<void> | void,
    isScheStatusPending: boolean,
}) {
    return (
        <Stack pt="md" gap="xl">
            {/* Strategy Header: Blue Background containing global info */}
            <StrategyHeader policy={policy} />

            {/* Target Grid */}
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
                <TargetCards policy={policy} onScheStatusChange={onScheStatusChange} isScheStatusPending={isScheStatusPending} />
            </SimpleGrid>
        </Stack>
    );
}


function getStatusUI(repo: UpdateRepositorySchema) {
    if (repo.linkStatus === 'UP' && repo.healthStatus === 'HEALTH') return { label: 'HEALTH', color: 'green' };
    if (repo.linkStatus === 'UP' && repo.healthStatus === 'INITIALIZING') return { label: 'INITIALIZING', color: 'yellow' };
    const label = repo.linkStatus === 'DOWN' ? 'DOWN' : repo.healthStatus;
    return { label: label, color: 'red' };
}

function StrategyHeader({ policy }: { policy: UpdateBackupPolicySchema }) {
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

                {/* Left Section: Strategy & DataSource align flex-start */}
                <Group gap={40} align="center">
                    {/* Strategy Column */}
                    <Stack gap={2}>
                        <Text size="xs" c="blue" fw={700} tt="uppercase" lts={1}>Strategy</Text>
                        <Text fw={800} size="lg" style={{ lineHeight: 1 }}>{policy.strategy.name}</Text>
                    </Stack>

                    {/* Data Source Column */}
                    <Box style={{ borderLeft: '1px solid var(--mantine-color-blue-outline)', paddingLeft: '40px' }}>
                        <Text size="xs" c="dimmed" fw={500}>Data Source</Text>
                        <Text fw={700} size="sm" ta="right">{policy.strategy.dataSource}</Text>
                    </Box>

                    {/* Data Size Column */}
                    <Box>
                        <Text size="xs" c="dimmed" fw={500}>Data Size</Text>
                        <Text fw={700} size="sm" ta="right">{formatBytes(policy.strategy.dataSourceSize)}</Text>
                    </Box>
                </Group>


                {/* Right Section: Target Numbers sits at the end */}
                <Stack gap={0} align="flex-end">
                    <Text size="xs" c="dimmed" fw={500}>Total Targets</Text>
                    <Text fw={700} size="sm" ta="right">{policy.targets.length}</Text>
                </Stack>

            </Group>
        </Paper>
    );
}

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

function TargetCards({
                         policy,
                         onScheStatusChange,
                         isScheStatusPending = false
                     }: {
    policy: UpdateBackupPolicySchema,
    onScheStatusChange: ({ jobId, status }: { jobId: number, status: 'pause' | 'resume' | 'trigger'}) => Promise<void> | void,
    isScheStatusPending: boolean,
})  {
    return policy.targets.map((target, index) => {
        const repoStatus = getStatusUI(target.repository);
        // Determine job status
        const jobUI = getJobUI(target.job.jobStatus);
        const isRunning = target.job.jobStatus === scheduleStatus.ACTIVE;

        return (
            <Paper key={index} withBorder p="md" radius="md" shadow="sm">
                <Stack gap="md">
                    {/* Header: Name + Health + Actions */}
                    <Group justify="space-between" wrap="nowrap" align="center">
                        <Tooltip label={repoStatus.label} withArrow>
                            <Badge variant="dot" color={repoStatus.color}>
                                Target {target.repository.name}
                            </Badge>
                        </Tooltip>


                        {/* Manual Trigger Quick Action */}
                        <Tooltip label="Run Backup Now">
                            <ActionIcon
                                variant="light"
                                color="blue"
                                loading={isScheStatusPending}
                                onClick={() => onScheStatusChange({jobId: target.job.id, status: 'trigger'})}>
                                <IconPlayerPlay size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    <Divider />

                    {/* Schedule Details */}
                    <Stack gap="xs">
                        <DetailRow
                            label="Schedule"
                            value={<Group gap={4}><IconClock size={14}/><Text size="sm" ff="monospace">{target.job.cron}</Text></Group>}
                        />
                        <DetailRow label="Retention" value={formatRetentionPolicy(target.retentionPolicy)} />

                        <DetailRow label="Last Run" value={formatTimestamp(target.lastBackupAt)} />
                        <DetailRow
                            label="Next Run"
                            value={isRunning ? formatTimestamp(target.job.nextRunAt) : "Suspended"}
                        />
                    </Stack>

                    {/* Quick Toggle for active status at bottom */}
                    <Group
                        justify="space-between"
                        mt="sm"
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
                            disabled={isScheStatusPending}
                            size="xs"
                            color="green"
                            // Toggle logic: If currently ACTIVE, set to PAUSED.
                            // If currently PAUSED or ERROR, set to ACTIVE.
                            onChange={() => onScheStatusChange({jobId: target.job.id, status: isRunning ? 'pause' : 'resume'})}
                            thumbIcon={
                                isScheStatusPending ? (
                                    <Loader size={10} color="gray" /> // 2. Visual feedback inside the switch
                                ) : undefined
                            }
                        />
                    </Group>
                </Stack>
            </Paper>
        );
    });
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

export default OverviewTab;
