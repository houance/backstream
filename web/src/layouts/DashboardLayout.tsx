import {
    AppShell,
    Title,
    Box,
    useMantineTheme,
    useComputedColorScheme,
} from '@mantine/core';
// Import the components we just created
import SideNavigation from '../components/SideNavigation';
import DashboardPage from '../features/dashboard/DashboardPage';

function DashboardLayout() {
    const theme = useMantineTheme();
    const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
    const isDarkMode = computedColorScheme === 'dark';

    return (
        <AppShell
            navbar={{
                width: { sm: 200, lg: 250 },
                breakpoint: 'sm',
            }}
            header={{ height: 60 }}
            padding="md"
        >
            <AppShell.Header>
                <Box style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 20px' }}>
                    <Title order={2}>Overview</Title>
                </Box>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                {/* Render the navigation component */}
                <SideNavigation />
            </AppShell.Navbar>

            <AppShell.Main
                style={{
                    backgroundColor: isDarkMode ? theme.colors.dark[8] : theme.colors.gray[0], // Use appropriate background colors
                }}
            >
                {/* Render the main dashboard content page */}
                <DashboardPage />
            </AppShell.Main>
        </AppShell>
    );
}

export default DashboardLayout;
