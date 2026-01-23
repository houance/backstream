import { IconLayoutDashboard, IconFolder, IconSettings, IconPlus } from '@tabler/icons-react';
import DashboardPage from '../features/dashboard/DashboardPage';
import StorageLocationsPage from '../features/storage/StorageLocationsPage';
import SettingsPage from "../features/settings/SettingsPage";
import CreatePolicyPage from "../features/create-policy/CreatePolicyPage";

export const APP_ROUTES = [
    { label: 'Overview', path: '/', icon: IconLayoutDashboard, element: <DashboardPage /> },
    { label: 'Storage Locations', path: '/storage-locations', icon: IconFolder, element: <StorageLocationsPage /> },
    { label: 'Settings', path: '/settings', icon: IconSettings, element: <SettingsPage /> },
    { label: 'Create Policy', path: '/create-policy', icon: IconPlus, element: <CreatePolicyPage /> },
] as const;

export type AppRoute = typeof APP_ROUTES[number];
