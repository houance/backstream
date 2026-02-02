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
    Grid, ThemeIcon
} from '@mantine/core';
import { STRATEGY_MAP } from './strategy-map.tsx'
import {
    EMPTY_BACKUP_POLICY_SCHEMA,
    insertBackupPolicySchema,
    type InsertBackupPolicySchema,
    type StrategyType,
} from '@backstream/shared'
import {zod4Resolver} from "mantine-form-zod-resolver";

export function CreatePolicyPage() {
    const form = useForm<InsertBackupPolicySchema>({
        initialValues: EMPTY_BACKUP_POLICY_SCHEMA,
        validate: zod4Resolver(insertBackupPolicySchema)
    });

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
            <Stack gap="xl">
                <Grid gutter="xl">
                    {/* Left Column: Strategy Selection */}
                    <Grid.Col span={{ base: 12, lg: 6}}>
                        <Stack gap="md">
                            <Card withBorder radius="md" p="lg">
                                <Title order={5} mb="md">1. Select Backup Type</Title>
                                <Radio.Group
                                    value={form.values.strategy.strategyType}
                                    onChange={handleStrategyTypeChange}
                                >
                                    <SimpleGrid cols={2} spacing="sm">
                                        {Object.entries(STRATEGY_MAP).map(([key, meta]) => (
                                            <Radio.Card
                                                key={key}
                                                value={key}
                                                p="sm"
                                                radius="md"
                                                style={{
                                                    borderColor: form.values.strategy.strategyType === key ? 'var(--mantine-color-blue-6)' : undefined,
                                                }}
                                            >
                                                <Group wrap="nowrap" align="center" justify="space-between">
                                                    <Group wrap="nowrap" align="center" gap="sm">
                                                        <Radio.Indicator color="blue" />
                                                        <div style={{ flex: 1 }}>
                                                            <Text fw={600} fz="sm" lh={1}>
                                                                {meta.label}
                                                            </Text>
                                                            <Text fz="xs" c="dimmed" mt={3} lh={1.2}>
                                                                {meta.description}
                                                            </Text>
                                                        </div>
                                                    </Group>

                                                    <ThemeIcon variant="white">
                                                        <meta.icon />
                                                    </ThemeIcon>
                                                </Group>
                                            </Radio.Card>
                                        ))}
                                    </SimpleGrid>
                                </Radio.Group>
                            </Card>
                            {/* Left Column: Basic/Shared Configuration */}
                            <Card withBorder radius="md" p="lg">
                                <Title order={5} mb="md">2. Basic Configuration</Title>
                                <TextInput label="Plan Name" {...form.getInputProps('name')} required />
                                <TextInput label="Source Path" placeholder="/data/mysql" {...form.getInputProps('dataSource')} />
                            </Card>
                        </Stack>
                    </Grid.Col>

                    {/* Right Panel: Strategy-Specific Form */}
                    <Grid.Col span={{base: 12, lg: 6}}>
                        <Card withBorder radius="md" p="lg" h="100%">
                            <Title order={5} mb="md">3. Specific Details</Title>
                            {/* Strategy-Specific Section: Swapped dynamically */}
                            {strategyMeta.component && <strategyMeta.component form={form} />}
                        </Card>
                    </Grid.Col>
                </Grid>
                {/* BOTTOM: creation */}
                <Button type="submit" size="md">Create Backup Plan</Button>
            </Stack>
        </Container>
    );
}

export default CreatePolicyPage;