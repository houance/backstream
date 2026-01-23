import { TextInput, Stack, NumberInput } from '@mantine/core';

export default function LocalBackupForm() {
    return (
        <Stack>
            <TextInput label="Source Directory" placeholder="/home/user/data" required />
            <TextInput label="Backup Destination" placeholder="/mnt/backup_drive" required />
            <NumberInput label="Retention Limit" description="How many versions to keep" defaultValue={5} />
        </Stack>
    );
}
