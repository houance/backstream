import {Card, Stack, Title} from "@mantine/core";
import {type InsertBackupPolicySchema, type UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {RepoSelector} from "./RepoSelector.tsx";
import {ScheduleConfig} from "./ScheduleConfig.tsx";
import {RetentionPolicyConfig} from "./RetentionPolicyConfig.tsx";

export function LocalBackupSubForm ({ form, repoList }: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    repoList: UpdateRepositorySchema[]
}) {

    return (
        <Card withBorder radius="md" p="lg">
            <Title order={5} mb="md">Local Repository Configuration</Title>
            <Stack gap="md">
                {/* Repository Selection */}
                <RepoSelector form={form} repoList={repoList} index={0}/>
                {/* --- Cron Schedule --- */}
                <ScheduleConfig form={form} index={0}/>
                {/* --- Retention Policy Config --- */}
                <RetentionPolicyConfig form={form} tagList={[]} index={0} />
            </Stack>
        </Card>
    )
}

export default LocalBackupSubForm;