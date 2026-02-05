import {Container} from '@mantine/core';
import SettingsDualPane from "./SettingsDualPane.tsx";

export function SettingsPage() {

    return (
        <Container size="xl" py="lg">
            <SettingsDualPane
                initialData={{
                    ioPriority: 'normal',
                    minDiskSpaceGB: 15,
                    email: '837507557@qq.com',
                    logRetentionDays: 1
                }}
                onSubmit={() => console.log('Settings page')} />
        </Container>
    )
}

export default SettingsPage;