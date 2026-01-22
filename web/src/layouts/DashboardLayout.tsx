import {
    AppShell,
    useMantineTheme,
    useComputedColorScheme,
} from '@mantine/core';
import { Routes, Route } from 'react-router-dom';

// Import the components/pages we need
import SideNavigation from '../components/SideNavigation';
import DashboardPage from '../features/dashboard/DashboardPage';
import StorageLocationsPage from '../features/storage/StorageLocationsPage.tsx';

function DashboardLayout() {
    const theme = useMantineTheme();
    const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
    const isDarkMode = computedColorScheme === 'dark';
    // Removed useLocation and getHeaderTitle logic as Header is gone

    return (
        <AppShell
            navbar={{
                width: { sm: 200, lg: 250 },
                breakpoint: 'sm',
            }}
            // Header prop is removed
            padding="md"
        >
            <AppShell.Navbar p="md">
                {/* Render the navigation component */}
                <SideNavigation />
            </AppShell.Navbar>

            <AppShell.Main
                style={{
                    backgroundColor: isDarkMode ? theme.colors.dark[8] : theme.colors.gray[0],
                }}
            >
                {/* Define the routes here */}
                <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/storage-locations" element={<StorageLocationsPage />} />
                    {/* Add more routes here as needed */}
                </Routes>
            </AppShell.Main>
        </AppShell>
    );
}

export default DashboardLayout;
