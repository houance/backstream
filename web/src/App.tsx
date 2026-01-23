import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import DashboardLayout from './layouts/DashboardLayout';
import {Notifications} from "@mantine/notifications";
import '@mantine/notifications/styles.css';

function App() {
    return (
        <BrowserRouter> {/* Wrap the application */}
            <MantineProvider>
                <Notifications position="top-right" />
                <DashboardLayout />
            </MantineProvider>
        </BrowserRouter>
    );
}

export default App;
