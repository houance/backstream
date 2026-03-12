import { IconLayoutDashboard, IconFolder, IconSettings, IconPlus } from '@tabler/icons-react';
import OverviewPage from '../features/overview/OverviewPage.tsx';
import StorageLocPage from '../features/storage/StorageLocPage.tsx';
import SettingsPage from "../features/settings/SettingsPage";
import CreatePolicyPage from "../features/create-policy/CreatePolicyPage";
import PolicyDetailPage from "../features/policy-detail/PolicyDetailPage.tsx";

export const NAV_ROUTES = [
    { label: 'Overview', path: '/', icon: IconLayoutDashboard, element: <OverviewPage /> },
    { label: 'Storage Locations', path: '/storage-locations', icon: IconFolder, element: <StorageLocPage /> },
    { label: 'Settings', path: '/settings', icon: IconSettings, element: <SettingsPage /> },
    { label: 'Create Policy', path: '/create-policy', icon: IconPlus, element: <CreatePolicyPage /> },
] as const;

export const DETAIL_ROUTES = [
    { path: '/policy/:id', element: <PolicyDetailPage /> },
] as const;

export const ALL_ROUTES = [...NAV_ROUTES, ...DETAIL_ROUTES] as const;
