import {
    AppShell, Title, useComputedColorScheme, useMantineTheme,
} from '@mantine/core';
import { Routes, Route, useLocation } from 'react-router-dom';

// Import the components/pages we need
import SideNavigation, { NAVIGATION_ITEMS } from '../components/SideNavigation';
import DashboardPage from '../features/dashboard/DashboardPage';
import StorageLocationsPage from '../features/storage/StorageLocationsPage.tsx';
import SettingsPage from "../features/settings/SettingsPage.tsx";
import {useDisclosure} from "@mantine/hooks";

function DashboardLayout() {
    // Find the label directly from the config based on current path
    const location = useLocation();
    const activeItem = NAVIGATION_ITEMS.find(item => item.to === location.pathname);
    const headerTitle = activeItem ? activeItem.label : 'BackupVault';

    // Hook to manage the navbar open/closed state
    const [opened] = useDisclosure();
    const theme = useMantineTheme();
    const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
    const isDarkMode = computedColorScheme === 'dark';

    return (
        <AppShell
            layout="alt"
            header={{ height: 60 }}
            navbar={{
                width: 300,
                breakpoint: 'sm', // Collapse navbar below the 'sm' breakpoint
                collapsed: { mobile: !opened }, // Link collapsed state to 'opened' variable on mobile
            }}
            padding="md" // Padding for the main content area
        >
            <AppShell.Header p="md">
                <Title order={2}>{headerTitle}</Title>
            </AppShell.Header>

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
                    <Route path="/settings" element={<SettingsPage />} />
                    {/* Add more routes here as needed */}
                </Routes>
            </AppShell.Main>
        </AppShell>
    );
}

export default DashboardLayout;
