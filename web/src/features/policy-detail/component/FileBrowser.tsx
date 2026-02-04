import type {SnapshotFile} from "@backstream/shared";
import {useMemo, useState} from "react";
import {ActionIcon, Anchor, Breadcrumbs, Group, Stack, Table, Text} from "@mantine/core";
import {IconChevronRight, IconDownload, IconFile, IconFolder} from "@tabler/icons-react";
import {formatBytes} from "../../../util/format.ts";

export function FileBrowser({ flatFiles }: { flatFiles: SnapshotFile[] }) {
    const [currentPath, setCurrentPath] = useState<string>('/');

    // Helper to determine the parent directory of any restic path
    const getParentPath = (path: string) => {
        if (path === '/') return null;
        const segments = path.split('/').filter(Boolean);
        if (segments.length <= 1) return '/';
        return '/' + segments.slice(0, -1).join('/');
    };

    // 1. Filter: Only show files whose parent is exactly the currentPath
    const visibleFiles = useMemo(() => {
        return flatFiles.filter((file) => {
            // Logic: A file/dir is a direct child if its parent is our current location
            const parent = getParentPath(file.path);
            return parent === currentPath && file.path !== currentPath;
        });
    }, [flatFiles, currentPath]);

    // 2. Breadcrumbs
    const pathSegments = currentPath.split('/').filter(Boolean);
    const breadcrumbItems = [
        <Anchor key="root" size="sm" onClick={() => setCurrentPath('/')}>root</Anchor>,
        ...pathSegments.map((segment, index) => {
            const targetPath = '/' + pathSegments.slice(0, index + 1).join('/');
            return (
                <Anchor key={targetPath} size="sm" onClick={() => setCurrentPath(targetPath)}>
                    {segment}
                </Anchor>
            );
        })
    ];

    return (
        <Stack gap="xs">
            <Group justify="apart">
                <Group gap="xs">
                    <Breadcrumbs separator="/">{breadcrumbItems}</Breadcrumbs>
                </Group>
            </Group>

            <Table variant="unstyled" highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Size</Table.Th>
                        <Table.Th>Modified</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {visibleFiles.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={4}>
                                <Text size="sm" c="dimmed" ta="center" py="xl">This folder is empty</Text>
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {visibleFiles.map((file) => (
                        <Table.Tr
                            key={file.path}
                            style={{ cursor: file.type === 'dir' ? 'pointer' : 'default' }}
                            onClick={() => file.type === 'dir' && setCurrentPath(file.path)}
                        >
                            <Table.Td>
                                <Group gap="xs">
                                    {file.type === 'dir' ? (
                                        <IconFolder size={18} color="var(--mantine-color-orange-5)" />
                                    ) : (
                                        <IconFile size={18} color="var(--mantine-color-gray-5)" />
                                    )}
                                    <Text size="sm">{file.name}</Text>
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                <Text size="xs" c="dimmed">
                                    {file.type === 'file' ? formatBytes(file.size) : '--'}
                                </Text>
                            </Table.Td>
                            <Table.Td>
                                <Text size="xs" c="dimmed">
                                    {new Date(file.mtime).toLocaleDateString()}
                                </Text>
                            </Table.Td>
                            <Table.Td>
                                <Group gap={4} justify="flex-end">
                                    {file.type === 'file' && (
                                        <ActionIcon size="sm" variant="subtle"><IconDownload size={14} /></ActionIcon>
                                    )}
                                    {file.type === 'dir' && <IconChevronRight size={14} c="dimmed" />}
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    );
}