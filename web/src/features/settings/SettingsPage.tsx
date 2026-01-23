import {
    Group,
    Switch,
    Select,
    NumberInput,
    Title,
    Stack,
    Box,
    Divider,
    Button,
    Container,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { SelectProps } from '@mantine/core';
import SettingRow from './components/SettingRow';

// Define the shape of your form values with TypeScript
interface FormValues {
    automaticBackups: boolean;
    emailNotifications: boolean;
    compression: boolean;
    retentionPeriod: '30 days' | '90 days' | '180 days' | '1 year';
    parallelTransfers: number;
    bandwidthLimit: '100 Mbps' | '500 Mbps' | '1 Gbps' | 'Unlimited';
    deduplication: boolean;
    encryption: boolean;
    encryptionAlgorithm: 'AES-128' | 'AES-256' | 'ChaCha20';
    twoFactorAuth: boolean;
}

// This component can be used directly within your router setup
function SettingsPage() {
    // Initialize form state with explicit type
    const form = useForm<FormValues>({
        mode: 'controlled', // Explicitly use controlled mode for full form.values integration
        initialValues: {
            automaticBackups: true,
            emailNotifications: true,
            compression: true,
            retentionPeriod: '90 days',
            parallelTransfers: 4,
            bandwidthLimit: '1 Gbps',
            deduplication: true,
            encryption: true,
            encryptionAlgorithm: 'AES-256',
            twoFactorAuth: false,
        },
        validate: {},
    });

    return (
        // We link the form hook to the handler function and ensure it is an HTML form element
        <Container fluid p={0}>
            {/* Add a specific header/title section at the top of the page */}
            <Box mb="xl" h="60" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title order={1}>Settings</Title>
            </Box>

            <Stack gap="lg" justify="space-around" align="stretch">
                {/* General Settings Section */}
                <Box>
                    <Title order={3} mb="md">General Settings</Title>
                    <Stack gap="lg">
                        <SettingRow label="Enable automatic backups" description="Run scheduled backups automatically">
                            {/* Mantine v7 handles type inference correctly */}
                            <Switch {...form.getInputProps('automaticBackups', { type: 'checkbox' })} />
                        </SettingRow>
                        <SettingRow label="Email notifications" description="Receive email alerts for backup events">
                            <Switch {...form.getInputProps('emailNotifications', { type: 'checkbox' })} />
                        </SettingRow>
                        <SettingRow label="Compression" description="Compress backup data to save storage">
                            <Switch {...form.getInputProps('compression', { type: 'checkbox' })} />
                        </SettingRow>
                        <SettingRow label="Retention period" description="How long to keep backup snapshots">
                            <Select
                                data={['30 days', '90 days', '180 days', '1 year'] as SelectProps['data']}
                                {...form.getInputProps('retentionPeriod')}
                                style={{ width: 120 }}
                            />
                        </SettingRow>
                    </Stack>
                </Box>

                <Divider />

                {/* Backup Performance Section */}
                <Box>
                    <Title order={3} mb="md">Backup Performance</Title>
                    <Stack gap="lg">
                        <SettingRow label="Parallel transfers" description="Number of concurrent backup streams">
                            <NumberInput
                                min={1}
                                max={10}
                                {...form.getInputProps('parallelTransfers')}
                                style={{ width: 80 }}
                            />
                        </SettingRow>
                        <SettingRow label="Bandwidth limit" description="Maximum network bandwidth for backups">
                            <Select
                                data={['100 Mbps', '500 Mbps', '1 Gbps', 'Unlimited'] as SelectProps['data']}
                                {...form.getInputProps('bandwidthLimit')}
                                style={{ width: 120 }}
                            />
                        </SettingRow>
                        <SettingRow label="Deduplication" description="Remove duplicate data blocks">
                            <Switch {...form.getInputProps('deduplication', { type: 'checkbox' })} />
                        </SettingRow>
                    </Stack>
                </Box>

                <Divider />

                {/* Security Section */}
                <Box>
                    <Title order={3} mb="md">Security</Title>
                    <Stack gap="lg">
                        <SettingRow label="Encryption" description="Encrypt backup data at rest">
                            <Switch {...form.getInputProps('encryption', { type: 'checkbox' })} />
                        </SettingRow>
                        <SettingRow label="Encryption algorithm" description="Algorithm used for encryption">
                            <Select
                                data={['AES-128', 'AES-256', 'ChaCha20'] as SelectProps['data']}
                                {...form.getInputProps('encryptionAlgorithm')}
                                style={{ width: 120 }}
                            />
                        </SettingRow>
                        <SettingRow label="Two-factor authentication" description="">
                            <Switch {...form.getInputProps('twoFactorAuth', { type: 'checkbox' })} disabled />
                        </SettingRow>
                    </Stack>
                </Box>
            </Stack>

            {/* Save Button */}
            <Group justify="flex-end" mt="xl" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <Button type="submit" variant="filled" color="blue">
                    Save Settings
                </Button>
            </Group>
        </Container>
    );
}

export default SettingsPage;
