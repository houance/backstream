import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import DashboardLayout from './layouts/DashboardLayout';
import {Notifications} from "@mantine/notifications";
import '@mantine/notifications/styles.css';
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

// 1. Create a client instance
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Prevents aggressive refetching during development
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter> {/* Wrap the application */}
                <MantineProvider>
                    <Notifications position="top-right" />
                    <DashboardLayout />
                </MantineProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default App;
