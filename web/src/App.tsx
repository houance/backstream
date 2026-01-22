import '@mantine/core/styles.css'; // Add this import
import { MantineProvider } from '@mantine/core';
import DashboardLayout from './layouts/DashboardLayout';

function App() {
    return (
        <MantineProvider>
            <DashboardLayout />
        </MantineProvider>
    );
}

export default App;
