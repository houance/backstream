import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import DashboardLayout from './layouts/DashboardLayout';

function App() {
    return (
        <BrowserRouter> {/* Wrap the application */}
            <MantineProvider>
                <DashboardLayout />
            </MantineProvider>
        </BrowserRouter>
    );
}

export default App;
