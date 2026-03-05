import {Card, Stack, Title} from "@mantine/core";
import type {InsertBackupPolicySchema, UpdateRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import {RepoSelector} from "./RepoSelector.tsx";
import {ScheduleConfig} from "./ScheduleConfig.tsx";
import {RetentionPolicyConfig} from "./RetentionPolicyConfig.tsx";

export function Strategy321Form ({ form, repoList }: {
    form: UseFormReturnType<InsertBackupPolicySchema>,
    repoList: UpdateRepositorySchema[]
}) {
    return (
        <Stack gap="md">
            <Card withBorder radius="md" p='lg'>
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

            <Card withBorder radius="md" p='lg'>
                <Title order={5} mb="md">Offsite Repository Configuration</Title>
                <Stack gap="md">
                    {/* Repository Selection */}
                    <RepoSelector form={form} repoList={repoList} index={1}/>
                    {/* --- Cron Schedule --- */}
                    <ScheduleConfig form={form} index={1}/>
                    {/* --- Retention Policy Config --- */}
                    <RetentionPolicyConfig form={form} tagList={[]} index={1} />
                </Stack>
            </Card>
        </Stack>
    )
}

export default Strategy321Form;