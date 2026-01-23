import React from 'react';
import { NavLink, Box, Title, Avatar } from '@mantine/core';
import {IconLayoutDashboard, IconFolder, IconSettings, IconPlus, type Icon} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom'; // Import Link and useLocation

interface NavItem {
    label: string;
    to: string;
    icon: Icon; // The standard type for Tabler icons
}

export const NAVIGATION_ITEMS: NavItem[] = [
    { label: 'Overview', to: '/', icon: IconLayoutDashboard },
    { label: 'Storage Locations', to: '/storage-locations', icon: IconFolder },
    { label: 'Settings', to: '/settings', icon: IconSettings },
    { label: 'Create Policy', to: '/create-policy', icon: IconPlus },
];

const SideNavigation: React.FC = () => {
    const location = useLocation(); // Get current location

    return (
        <Box h="100%" display="flex" style={{ flexDirection: 'column' }}>
            <Title order={3} mb="xl">BackStream</Title>

            {NAVIGATION_ITEMS.map((item) => (
                <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    leftSection={<item.icon size="1rem" stroke={1.5} />}
                    active={location.pathname === item.to}
                />
            ))}

            {/* User Profile Section */}
            <Box mt="auto" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <NavLink
                    label="USER"
                    description="Admin"
                    leftSection={<Avatar name="U" radius="xl" color="blue" size="sm" />}
                />
            </Box>
        </Box>
    );
};

export default SideNavigation;
