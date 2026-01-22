import React from 'react';
import { NavLink, Box, Title, Avatar } from '@mantine/core';
import { IconLayoutDashboard, IconFolder, IconSettings, IconPlus } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom'; // Import Link and useLocation

const SideNavigation: React.FC = () => {
    const location = useLocation(); // Get current location

    return (
        <Box h="100%" display="flex" style={{ flexDirection: 'column' }}>
            <Title order={3} mb="xl">BackupVault</Title>

            <NavLink
                component={Link}
                to="/"
                label="Overview"
                leftSection={<IconLayoutDashboard size="1rem" stroke={1.5} />}
                active={location.pathname === '/'} // Set active based on path
            />

            <NavLink
                component={Link}
                to="/storage-locations"
                label="Storage Locations"
                leftSection={<IconFolder size="1rem" stroke={1.5} />}
                active={location.pathname === '/storage-locations'} // Set active based on path
            />
            <NavLink
                label="Settings"
                leftSection={<IconSettings size="1rem" stroke={1.5} />}
                active={location.pathname === '/settings'} // Set active based on path
            />
            <NavLink
                label="Create Policy"
                leftSection={<IconPlus size="1rem" stroke={1.5} />}
                active={location.pathname === '/create-policy'} // Set active based on path
            />

            {/* User Profile Section */}
            <Box mt="auto" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <NavLink
                    label="John Doe"
                    description="Admin"
                    leftSection={<Avatar name="JD" radius="xl" color="blue" size="sm" />}
                />
            </Box>
        </Box>
    );
};

export default SideNavigation;
