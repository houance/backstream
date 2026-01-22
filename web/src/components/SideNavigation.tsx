import React from 'react';
import { NavLink, Box, Title, Avatar } from '@mantine/core';
import { IconLayoutDashboard, IconFolder, IconSettings, IconPlus } from '@tabler/icons-react';

const SideNavigation: React.FC = () => {
    return (
        <Box h="100%" display="flex" style={{ flexDirection: 'column' }}>
            <Title order={3} mb="xl">BackStream</Title>

            <NavLink
                label="Overview"
                leftSection={<IconLayoutDashboard size="1rem" stroke={1.5} />}
                active
            />
            <NavLink
                label="Storage Locations"
                leftSection={<IconFolder size="1rem" stroke={1.5} />}
            />
            <NavLink
                label="Settings"
                leftSection={<IconSettings size="1rem" stroke={1.5} />}
            />
            <NavLink
                label="Create Policy"
                leftSection={<IconPlus size="1rem" stroke={1.5} />}
            />

            {/* User Profile Section */}
            <Box mt="auto" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <NavLink
                    label="User"
                    description="Admin"
                    leftSection={<Avatar name="U" radius="xl" color="blue" size="sm" />}
                />
            </Box>
        </Box>
    );
};

export default SideNavigation;
