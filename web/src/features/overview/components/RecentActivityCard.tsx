import {Badge, Card, List, Text, Title} from "@mantine/core";

interface Activity {
    title: string;
    description: string;
    completeAt: number;
    level: "INFO" | "WARN" | "ALERT";
}

interface RecentActivityProps {
    activitiesList: Activity[];
}

function formatRelativeTime(utcTimestamp: number): string {
    // 获取当前时间的 UTC 时间戳
    const now = Date.now();
    const diffMs = now - utcTimestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // 根据时间差选择合适的单位
    if (diffDay > 0) {
        return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
    } else if (diffHour > 0) {
        return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffMin > 0) {
        return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
    } else {
        return 'just now';
    }
}

export function RecentActivityCard( { activitiesList }: RecentActivityProps) {
    return (
        <Card shadow="sm" p="lg" radius="md" withBorder>
            <Title order={3} mb="md">Recent Activity</Title>
            <List spacing="xs" size="sm" center>
                {activitiesList.map((activity) => (
                    <List.Item>
                        <b>{activity.title}</b> {activity.description}
                        <Text size="xs" c="dimmed">{formatRelativeTime(activity.completeAt)}</Text>
                        {activity.level === "WARN" && (
                            <Badge color="yellow" ml="xs">Alert</Badge>
                        )}
                        {activity.level === "ALERT" && (
                            <Badge color="red" ml="xs">Alert</Badge>
                        )}
                    </List.Item>
                ))}
            </List>
        </Card>
    )
}