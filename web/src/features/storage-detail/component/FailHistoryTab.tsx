import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Stack, Paper, LoadingOverlay, Accordion, Group, Select, Pagination, Text } from '@mantine/core';
import { DatePickerInput } from "@mantine/dates";
import dayjs from "dayjs";
import { client } from "../../../api"; // Adjust path
import { formatTimeString } from "../../../util/format.ts"; // Adjust path
import { FailHistoryRow } from '../../../component/FailHistoryRow';
import type {FilterQuery, UpdateRepositorySchema} from "@backstream/shared";

export function FailHistoryTab({ storage }: {
    storage: {
        repo: UpdateRepositorySchema,
        snapshotCount: number,
        snapshotSize: number,
        lastCheckTimestamp: number | null,
        lastPruneTimestamp: number | null,
    }
}) {
    const today = dayjs();
    const [activeLogId, setActiveLogId] = useState<number | null>(null);
    const [filter, setFilter] = useState<FilterQuery>({
        page: 1,
        pageSize: 15,
        startTime: 0,
        endTime: 0
    });
    const repo = storage.repo;

    // 1. Fetch Failure Metadata List
    const { data: listData, isLoading: isListLoading, isPlaceholderData } = useQuery({
        queryKey: ['storage-fail-history-list', filter, repo.id],
        queryFn: async () => {
            const res = await client.api.storage['fail-history'].$post({
                json: { storageId: repo.id, filterQuery: filter }
            });
            if (!res.ok) throw new Error('Failed to fetch repository fail history');
            return res.json();
        },
        refetchInterval: 5000,
        placeholderData: keepPreviousData,
    });

    // 2. Fetch Detailed Logs (Lazy)
    const { data: logData, isLoading: isLogLoading } = useQuery({
        queryKey: ['storage-fail-logs', activeLogId],
        queryFn: async () => {
            const res = await client.api.info['fail-history-log'][':id'].$get({
                param: { id: activeLogId!.toString() },
            });
            if (!res.ok) throw new Error('Failed to fetch repository logs')
            return res.json();
        },
        enabled: !!activeLogId,
        staleTime: Infinity,
    });

    return (
        <Stack gap="md">
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

                    {/* ACCORDION LIST */}
                    <Accordion variant="separated" chevronPosition="right">
                        {listData?.failHistory.map((item) => (
                            <FailHistoryRow
                                key={item.uuid}
                                item={item}
                                onOpen={(id) => setActiveLogId(id)}
                                logs={activeLogId === item.executionId ? logData?.logs : []}
                                isLoadingLogs={activeLogId === item.executionId && isLogLoading}
                            />
                        ))}
                    </Accordion>

                    {/* PAGINATION FOOTER */}
                    <Group justify="flex-end" gap="sm">
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
                            total={Math.ceil((listData?.count || 0) / filter.pageSize)}
                            onChange={(page) => setFilter(prev => ({ ...prev, page }))}
                        />
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
}
