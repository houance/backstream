import { notifications } from '@mantine/notifications';
import {IconCheck, IconX} from '@tabler/icons-react';

export function notice(success: boolean, msg: string) {
    if (success) {
        notifications.show({
            title: 'Success!',
            message: msg,
            color: 'teal',
            autoClose: 3000,
            icon: <IconCheck size={18} />
    });
    } else {
        notifications.show({
            title: 'Submission Failed',
            message: msg,
            color: 'red',
            autoClose: 5000,
            icon: <IconX size={18} />
    });
    }
}