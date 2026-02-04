import { useForm } from '@mantine/form';
import {
    Text,
    TextInput,
    Stack,
    Button,
    Card,
    Title,
    Container,
    Radio,
    SimpleGrid,
    Group,
    ThemeIcon,
    Stepper,
    Paper,
    Divider,
    Grid,
} from '@mantine/core';
import { STRATEGY_MAP } from './strategy-map.tsx'
import {
    EMPTY_BACKUP_POLICY_SCHEMA,
    insertBackupPolicySchema,
    type InsertBackupPolicySchema,
    type StrategyType, type UpdateRepositorySchema,
} from '@backstream/shared'
import {zod4Resolver} from "mantine-form-zod-resolver";
import {useState} from "react";
import {
    IconArrowLeft,
    IconArrowRight,
    IconClock,
    IconDatabase,
    IconServer,
    IconSettingsAutomation,
    IconShieldCheck,
    IconTarget
} from "@tabler/icons-react";
import {notice} from "../../util/notification.tsx";

export function CreatePolicyPage() {
    const [loading, setLoading] = useState(false);

    const form = useForm<InsertBackupPolicySchema>({
        initialValues: EMPTY_BACKUP_POLICY_SCHEMA,
        validate: zod4Resolver(insertBackupPolicySchema)
    });
    const [active, setActive] = useState(0);

    const nextStep = () => {
        // If moving from Step 2 (Details) to Step 3
        if (active === 1) {
            // Validate only the fields in Step 2
            const nameValid = form.validateField('strategy.name');
            const pathValid = form.validateField('strategy.dataSource');

            // If either has an error, stop here
            if (nameValid.hasError || pathValid.hasError) return;
        }

        // If moving from Step 3 to Completed, you might want to validate 'targets'
        if (active === 2) {
            const targetValid = form.validate(); // Validates everything remaining
            if (targetValid.hasErrors) return;
        }

        setActive((current) => (current < 3 ? current + 1 : current));
    };
    const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));
    const handleFinalSubmit = (values: typeof form.values) => {
        setLoading(true);
        try {
            // api
            console.info(values)
            // clear state
            form.reset();
            setActive(0);
        } catch (e) {
            notice(false, 'create policy failed');
        } finally {
            setLoading(false);
        }

    };
    // clear form.targets base on type
    const handleStrategyTypeChange = (value: string) => {
        const strategyType = value as StrategyType;
        form.setFieldValue('strategy.strategyType', strategyType);
        const newConfig = STRATEGY_MAP[strategyType];
        form.setFieldValue('targets', newConfig.initSubForm)
    }
    // Dynamically select the component based on strategy
    const strategyMeta = STRATEGY_MAP[form.values.strategy.strategyType];
    // Repository List
    const repoList: UpdateRepositorySchema[] = [{
        path: '/abc/d',
        name: 'test1',
        password: 'fdsa',
        repositoryType: 'LOCAL',
        usage: 0,
        capacity: 0,
        repositoryStatus: 'Active',
        id: 1
    }]
    const getRepoNameById = (id: string | number): string => {
        const repo = repoList.find(repo => repo.id === Number(id))
        return repo ? repo.name : "undefined";
    }

    return (
        <Container fluid>
            <form onSubmit={form.onSubmit(handleFinalSubmit)} >
                <Paper
                    withBorder
                    shadow="sm"
                    radius="md"
                    p={{ base: 'md', sm: 'xl' }} // Responsive padding
                    bg="var(--mantine-color-body)" // Ensures it matches theme background>
                >
                    <Title order={2} mb="xl" ta="center">New Backup Plan</Title>

                    <Stepper active={active}
                             onStepClick={setActive}
                             allowNextStepsSelect={false}>
                        {/* Step 1: Selection */}
                        <Stepper.Step label="Select Type">
                            <Card withBorder p="lg" mt="xl" radius="md">
                                <Radio.Group
                                    value={form.values.strategy.strategyType}
                                    onChange={handleStrategyTypeChange} // Use custom handler
                                >
                                    <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                                        {Object.entries(STRATEGY_MAP).map(([key, meta]) => (
                                            <Radio.Card key={key} value={key} p="sm" radius="md">
                                                <Group wrap="nowrap">
                                                    <Radio.Indicator />
                                                    <div style={{ flex: 1 }}>
                                                        <Text fw={600} fz="sm">{meta.label}</Text>
                                                        <Text fz="xs" c="dimmed">{meta.description}</Text>
                                                    </div>
                                                    <ThemeIcon variant="light"><meta.icon size={16} /></ThemeIcon>
                                                </Group>
                                            </Radio.Card>
                                        ))}
                                    </SimpleGrid>
                                </Radio.Group>
                            </Card>
                        </Stepper.Step>

                        {/* Step 2: Basic Info */}
                        <Stepper.Step label="Details">
                            <Card withBorder p="lg" mt="xl" radius="md">
                                <Stack>
                                    <TextInput label="Plan Name" placeholder="Production Daily" {...form.getInputProps('strategy.name')} required />
                                    <TextInput label="Source Path" placeholder="/data/mysql" {...form.getInputProps('strategy.dataSource')} required />
                                </Stack>
                            </Card>
                        </Stepper.Step>

                        {/* Step 3: Target Config */}
                        <Stepper.Step label="Configuration">
                            <Card withBorder p="lg" mt="xl" radius="md">
                                <Text fw={600} mb="xs">Targeting: {strategyMeta.label}</Text>
                                <Text fz="xs" c="dimmed" mb="xl">The fields below have been reset for {strategyMeta.label} configuration.</Text>
                                {/* Strategy-specific UI (Example for Local vs S3) */}
                                {strategyMeta.component && <strategyMeta.component form={form} repoList={repoList} />}
                            </Card>
                        </Stepper.Step>

                        {active === 3 && <Stepper.Completed>
                            <Stack gap="xl" ta="left">
                                {/* SECTION 1: GLOBAL STRATEGY */}
                                <Stack gap="xs">
                                    <Divider
                                        label={
                                            <Group gap={4}>
                                                <IconSettingsAutomation size={14} />
                                                <Text size="xs" fw={700} tt="uppercase">Strategy Configuration</Text>
                                            </Group>
                                        }
                                        labelPosition="left"
                                    />

                                    <Paper withBorder p="md" radius="md" shadow="xs">
                                        <SimpleGrid cols={{ base: 1, sm: 2 }} verticalSpacing="md">
                                            <Group gap="md">
                                                <ThemeIcon variant="light" color="blue" radius="md">
                                                    <IconSettingsAutomation size={18} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="xs" c="dimmed" fw={700}>STRATEGY NAME</Text>
                                                    <Text size="sm" fw={500}>{form.values.strategy.name || "N/A"}</Text>
                                                </div>
                                            </Group>

                                            <Group gap="md">
                                                <ThemeIcon variant="light" color="cyan" radius="md">
                                                    <IconDatabase size={18} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="xs" c="dimmed" fw={700}>DATA SOURCE</Text>
                                                    <Text size="sm" fw={500}>{form.values.strategy.dataSource || "N/A"}</Text>
                                                </div>
                                            </Group>
                                        </SimpleGrid>
                                    </Paper>
                                </Stack>

                                {/* SECTION 2: TARGETS */}
                                <Stack gap="xs">
                                    <Divider
                                        label={
                                            <Group gap={4}>
                                                <IconTarget size={14} />
                                                <Text size="xs" fw={700} tt="uppercase">Backup Targets ({form.values.targets.length})</Text>
                                            </Group>
                                        }
                                        labelPosition="left"
                                    />

                                    {form.values.targets.map((target, index: number) => (
                                        <Paper key={index} withBorder p="md" radius="md" shadow="xs">
                                            <Grid align="center">
                                                {/* Repository Name */}
                                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                                    <Group gap="xs">
                                                        <IconServer size={16} color="var(--mantine-color-blue-filled)" />
                                                        <div>
                                                            <Text size="xs" c="dimmed" fw={700}>REPOSITORY NAME</Text>
                                                            <Text fw={600}>{getRepoNameById(target.repositoryId)}</Text>
                                                        </div>
                                                    </Group>
                                                </Grid.Col>

                                                {/* Retention Policy */}
                                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                                    <Group gap="xs">
                                                        <IconShieldCheck size={16} color="var(--mantine-color-green-filled)" />
                                                        <div>
                                                            <Text size="xs" c="dimmed" fw={700}>RETENTION</Text>
                                                            <Text size="sm">Keep {target.retentionPolicy.countValue} ({target.retentionPolicy.type})</Text>
                                                        </div>
                                                    </Group>
                                                </Grid.Col>

                                                {/* Schedule Policy */}
                                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                                    <Group gap="xs">
                                                        <IconClock size={16} color="var(--mantine-color-orange-filled)" />
                                                        <div>
                                                            <Text size="xs" c="dimmed" fw={700}>SCHEDULE</Text>
                                                            <Text size="sm">  {target.schedulePolicy} </Text>
                                                        </div>
                                                    </Group>
                                                </Grid.Col>
                                            </Grid>
                                        </Paper>
                                    ))}
                                </Stack>
                                {/* Create Policy Button */}
                                <Button mt="xl" type="submit" loading={loading}>Create Policy</Button>
                            </Stack>
                        </Stepper.Completed>}
                    </Stepper>

                    {/* Step 3: Target Config */}
                    {active < 3 && (
                        <Group justify="center" mt="xl">
                            <Button variant="default" onClick={prevStep} leftSection={<IconArrowLeft size={16} />} disabled={active === 0}>Back</Button>
                            <Button onClick={nextStep} rightSection={<IconArrowRight size={16} />}>Next Step</Button>
                        </Group>
                    )}
                </Paper>
            </form>
        </Container>
    );
}

export default CreatePolicyPage;