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
    Paper
} from '@mantine/core';
import { STRATEGY_MAP } from './strategy-map.tsx'
import {
    EMPTY_BACKUP_POLICY_SCHEMA,
    insertBackupPolicySchema,
    type InsertBackupPolicySchema,
    type StrategyType,
} from '@backstream/shared'
import {zod4Resolver} from "mantine-form-zod-resolver";
import {useState} from "react";
import {IconArrowLeft, IconArrowRight, IconCheck} from "@tabler/icons-react";

export function CreatePolicyPage() {
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
        console.log('Submitting to API:', values);

        // 1. Logic to send to backend goes here
        // Example: await api.createPlan(values);

        // 2. Reset the process
        handleReset();
    };
    const handleReset = () => {
        form.reset();         // Returns all values to initialValues
        setActive(0);         // Jumps back to the first step
    };

    const handleStrategyTypeChange = (value: string) => {
        const strategyType = value as StrategyType;
        form.setFieldValue('strategy.strategyType', strategyType);
        const newConfig = STRATEGY_MAP[strategyType];
        form.setFieldValue('targets', newConfig.initSubForm)
    }

    // Dynamically select the component based on strategy
    const strategyMeta = STRATEGY_MAP[form.values.strategy.strategyType];

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
                                {strategyMeta.component && <strategyMeta.component form={form} repoList={[{
                                    path: '/abc/d',
                                    name: 'test1',
                                    password: 'fdsa',
                                    repositoryType: 'LOCAL',
                                    usage: 0,
                                    capacity: 0,
                                    repositoryStatus: 'Active',
                                    id: 1
                                }]} />}
                            </Card>
                        </Stepper.Step>

                        <Stepper.Completed>
                            <Card withBorder p="xl" mt="xl" radius="md" ta="center">
                                <ThemeIcon size={60} radius={60} color="green" variant="light" mx="auto" mb="md"><IconCheck size={34} /></ThemeIcon>
                                <Text fw={700} fz="lg">Configuration Complete</Text>
                                <Button mt="xl" type="submit">Create Plan</Button>
                            </Card>
                        </Stepper.Completed>
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