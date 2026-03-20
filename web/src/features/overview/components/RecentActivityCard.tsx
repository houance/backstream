import { Badge, Card, Group, List, Text, Title, ThemeIcon } from "@mantine/core";
import { IconCircleCheck, IconAlertCircle, IconExclamationCircle } from "@tabler/icons-react";
import { formatTimestampRelative } from "../../../util/format.ts";
import { type Activity } from '@backstream/shared';

export function RecentActivityCard({ activities }: { activities: Activity[] }) {
    // Helper to pick icon/color based on level
    const getStatusProps = (level: string) => {
        switch (level) {
            case "ALERT": return { icon: <IconExclamationCircle size={16} />, color: "red" };
            case "WARN": return { icon: <IconAlertCircle size={16} />, color: "yellow" };
            default: return { icon: <IconCircleCheck size={16} />, color: "teal" };
        }
    };

    return (
        <Card shadow="sm" p="lg" radius="md" withBorder>
            <Title order={4} mb="lg">Recent Activity</Title>

            <List spacing="md" size="sm" center={false}>
                {activities.map((activity) => {
                    const status = getStatusProps(activity.level);

                    return (
                        <List.Item
                            key={activity.id}
                            icon={
                                <ThemeIcon color={status.color} size={22} radius="xl" variant="light">
                                    {status.icon}
                                </ThemeIcon>
                            }
                        >
                            <div>
                                <Text fw={600} size="md" lh={1.2}>{activity.title}</Text>
                                <Text c="dimmed" size="xs" mt={2}>{activity.description}</Text>

                                <Group gap="xs" mt={6} wrap="nowrap" align="center">
                                    <Text size="xs" c="dimmed" span>
                                        {formatTimestampRelative(activity.completeAt)}
                                    </Text>
                                    {activity.level !== "INFO" && (
                                        <Badge color={status.color} size="xs" variant="filled">
                                            {activity.level}
                                        </Badge>
                                    )}
                                </Group>
                            </div>
                        </List.Item>
                    );
                })}
            </List>
        </Card>
    );
}
