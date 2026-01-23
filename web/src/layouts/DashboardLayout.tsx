import { AppShell, Title, NavLink, Avatar, Box, useMantineTheme, useComputedColorScheme } from '@mantine/core';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { APP_ROUTES } from '../router/config';

export default function DashboardLayout() {
    const location = useLocation();
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme();

    // SSoT: Find current page metadata
    const activeRoute = APP_ROUTES.find(route => route.path === location.pathname);

    return (
        <AppShell
            layout="alt"
            header={{ height: 60 }}
            navbar={{ width: 280, breakpoint: 'sm' }}
            padding="md"
        >
            {/* Header: Title is derived from SSoT */}
            <AppShell.Header p="md" style={{ display: 'flex', alignItems: 'center' }}>
                <Title order={3}>{activeRoute?.label || 'BackupVault'}</Title>
            </AppShell.Header>

            {/* Navbar: Navigation is generated from SSoT */}
            <AppShell.Navbar p="md">
                <Title order={4} mb="xl" px="sm" c="blue">BackStream</Title>

                <Box component="nav">
                    {APP_ROUTES.map((item) => (
                        <NavLink
                            key={item.path}
                            component={Link}
                            to={item.path}
                            label={item.label}
                            leftSection={<item.icon size="1.1rem" stroke={1.5} />}
                            active={location.pathname === item.path}
                            variant="light"
                            radius="md"
                            mb={4}
                        />
                    ))}
                </Box>

                <Box mt="auto" pt="md" style={{ borderTop: `1px solid var(--mantine-color-gray-3)` }}>
                    <NavLink
                        label="User Admin"
                        description="Professional Plan"
                        leftSection={<Avatar radius="xl" color="blue" size="sm">UA</Avatar>}
                    />
                </Box>
            </AppShell.Navbar>

            {/* Main Content: Routes are mapped from SSoT */}
            <AppShell.Main bg={colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0]}>
                <Routes>
                    {APP_ROUTES.map((route) => (
                        <Route key={route.path} path={route.path} element={route.element} />
                    ))}
                </Routes>
            </AppShell.Main>
        </AppShell>
    );
}
