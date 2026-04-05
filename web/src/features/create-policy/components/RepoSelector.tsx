import type {UseFormReturnType} from "@mantine/form";
import type {InsertBackupPolicySchema, UpdateRepositorySchema} from "@backstream/shared";
import {Group, Select, Tooltip, Text} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { client } from '../../../api'
import {IconAlertTriangle} from "@tabler/icons-react";

export function RepoSelector({form, repoList, index}: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    repoList: UpdateRepositorySchema[],
    index: number;
}) {
    const dataSource = form.values.strategy.dataSource;

    // 1. Fetch a map of which repos are "unsafe" (same drive)
    // Sending the full list IDs once is more efficient than individual calls
    const { data: driveWarnings = [] } = useQuery({
        queryKey: ['driveConflictMap', dataSource, repoList.map(r => r.id)],
        queryFn: async () => {
            const res = await client.api.info['same-drive-repo'].$post({
                json: { dataSource: dataSource, repoIds: repoList.map(r => r.id) }
            })
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!dataSource && repoList.length > 0,
    });

    return (
        <Select
            label="Backup Repository"
            placeholder="Select a repository"
            data={repoList.map(repo => ({
                label: repo.name,
                value: String(repo.id),
            }))}
            searchable
            value={form.values.targets[index].schedule.repositoryId ? String(form.values.targets[index].schedule.repositoryId) : null}            // 2. Update both fields at once
            onChange={(_value) => {
                // Update primary field
                form.setFieldValue(`targets.${index}.schedule.repositoryId`, Number(_value));
                // Update secondary field
                form.setFieldValue(`targets.${index}.meta.repositoryId`, Number(_value));
            }}
            // 3. Manually pass the error (since we aren't using getInputProps)
            error={form.errors[`targets[${index}].meta.repositoryId`]}
            // 2. Custom rendering for options in the dropdown
            renderOption={({ option }) => {
                const isUnsafe = driveWarnings.includes(Number(option.value));

                return (
                    <Group justify="space-between" gap="xs" style={{ width: '100%' }}>
                        <Text size="sm">{option.label}</Text>
                        {isUnsafe && (
                            <Tooltip
                                label="Source and backup share one failure"
                                color="yellow"
                                position="right"
                                withArrow
                            >
                                <IconAlertTriangle size={16} color="red" />
                            </Tooltip>
                        )}
                    </Group>
                );
            }}
        />
    );
}