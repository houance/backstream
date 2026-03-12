import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Stack, Paper, SegmentedControl, Center, Text, LoadingOverlay, Accordion, Group, Select, Pagination } from '@mantine/core';
import { IconCloud, IconDatabase } from '@tabler/icons-react';
import type {FilterQuery, UpdateBackupPolicySchema} from "@backstream/shared";
import { FailHistoryRow } from './FailHistoryRow';
import {client} from "../../../api";
import {DatePickerInput} from "@mantine/dates";
import {formatTimeString} from "../../../util/format.ts";
import dayjs from "dayjs";

export default function FailHistory({ policy }: { policy: UpdateBackupPolicySchema }) {
    const today = dayjs();
    const targets = policy.targets || [];
    const [selectedTargetId, setSelectedTargetId] = useState<string>(targets[0]?.id.toString());
    const [activeLogId, setActiveLogId] = useState<number | null>(null);
    const [filter, setFilter] = useState<FilterQuery>({
        page: 0,
        pageSize: 15,
        startTime: 0,
        endTime: 0
    });

    // 1. Fetch failure list metadata
    const { data: listData, isLoading: isListLoading, isPlaceholderData } = useQuery({
        queryKey: ['fail-history-list', selectedTargetId, filter],
        queryFn: async () => {
            const res = await client.api.policy['fail-history'].$post({
                json: {
                    targetId: Number(selectedTargetId),
                    filterQuery: filter,
                }
            })
            if (!res.ok) throw new Error('Failed to fetch all fail history');
            return res.json();
        },
        enabled: !!selectedTargetId,
        refetchInterval: 5000,
        placeholderData: keepPreviousData, // Replaces v4's keepPreviousData: true
    });

    // 2. Fetch specific logs (Lazy)
    const { data: logData, isLoading: isLogLoading } = useQuery({
        queryKey: ['fail-logs', activeLogId],
        queryFn: async () => {
            const res = await client.api.policy['fail-history-log'][':id'].$get({
                param: { id: activeLogId!.toString() },
            });
            if (!res.ok) throw new Error('Failed to fetch all logs');
            return res.json();
        },
        enabled: !!activeLogId, // Only fetch when an execution is opened
        staleTime: Infinity,    // Keep logs cached once loaded
    });

    return (
        <Stack pt="md" gap="lg">
            {/* CLEAN TARGET SELECTOR */}
            {targets.length > 1 && (
                <SegmentedControl
                    fullWidth
                    size="sm"
                    value={selectedTargetId}
                    onChange={(val) => {
                        setSelectedTargetId(val);
                        setActiveLogId(null);
                        setFilter(f => ({ ...f, page: 1 }));
                    }}
                    data={targets.map(t => ({
                        label: (
                            <Center style={{ gap: 8 }}>
                                {t.repository.repositoryType !== 'LOCAL' ? <IconCloud size={14}/> : <IconDatabase size={14}/>}
                                <Text size="xs" fw={500}>{t.repository.name}</Text>
                            </Center>
                        ),
                        value: t.id.toString()
                    }))}
                />
            )}

            {/* FAILURE HISTORY AREA */}
            <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)" pos="relative">
                <Stack gap="xs" pos="relative">
                    <LoadingOverlay visible={isListLoading && !isPlaceholderData} overlayProps={{ blur: 1 }} />
                    {/* ACTION BAR: DATE PICKER & RESET PUSHED TO RIGHT */}
                    <DatePickerInput
                        type="range"
                        placeholder="Filter by date range"
                        size="sm" // Extra small for a compact filter look
                        w={280}
                        value={[
                            filter.startTime ? new Date(filter.startTime) : null,
                            filter.endTime ? new Date(filter.endTime) : null
                        ]}
                        onChange={(dates) => {
                            const [start, end] = dates;
                            setFilter((prev) => ({
                                ...prev,
                                page: 0,
                                startTime: formatTimeString(start),
                                endTime: formatTimeString(end),
                            }));
                        }}
                        clearable
                        presets={[
                            {
                                value: [
                                    today.subtract(2, 'day').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('day').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'Last two days',
                            },
                            {
                                value: [
                                    today.subtract(7, 'day').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('day').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'Last 7 days',
                            },
                            {
                                value: [
                                    today.startOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.endOf('month').format('YYYY-MM-DD HH:mm:ss.SSS')
                                ],
                                label: 'This month',
                            },
                            {
                                value: [
                                    today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                ],
                                label: 'Last month',
                            },
                            {
                                value: [
                                    today.subtract(1, 'year').startOf('year').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                    today.subtract(1, 'year').endOf('year').format('YYYY-MM-DD HH:mm:ss.SSS'),
                                ],
                                label: 'Last year',
                            },
                        ]}
                    />
                    {/* Fail History Row */}
                    <Accordion variant="unstyled">
                        {listData?.failHistory.map((item: any) => (
                            <FailHistoryRow
                                key={item.uuid}
                                item={item}
                                onOpen={setActiveLogId}
                                logs={activeLogId === item.executionId ? logData?.logs : []}
                                isLoadingLogs={activeLogId === item.executionId && isLogLoading}
                            />
                        ))}
                    </Accordion>

                    {/* PAGINATION FOOTER */}
                    <Group justify="flex-end" gap="sm" mt="md">
                        <Text size="xs" c="dimmed">Items per page:</Text>
                        <Select
                            size="xs"
                            w={70}
                            data={['10', '15', '30']}
                            value={filter.pageSize.toString()}
                            onChange={(val) => setFilter(prev => ({ ...prev, page: 1, pageSize: Number(val) }))}
                        />
                        <Pagination
                            size="sm"
                            value={filter.page}
                            total={Math.ceil((listData?.count ?? 0) / filter.pageSize)}
                            onChange={(p) => setFilter(prev => ({ ...prev, page: p }))}
                            withEdges
                        />
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
}
