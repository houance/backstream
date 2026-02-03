import type {UseFormReturnType} from "@mantine/form";
import type {InsertBackupPolicySchema, UpdateRepositorySchema} from "@backstream/shared";
import {Select} from "@mantine/core";

export function RepoSelector({form, repoList, index}: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    repoList: UpdateRepositorySchema[],
    index: number;
}) {
    const fieldPath = `targets.${index}.repositoryId`;

    return (
        <Select
            label="Backup Repository"
            placeholder="Select a repository"
            data={repoList.map(repo => ({
                label: repo.name,
                value: String(repo.id)
            }))}
            searchable
            nothingFoundMessage="No repositories found"
            {...form.getInputProps(fieldPath)}
            withAsterisk
        />
    )
}