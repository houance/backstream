import {Badge, Card, List, Text, Title} from "@mantine/core";
import {formatTimestampRelative} from "../../../util/format.ts";
import {type Activity} from '@backstream/shared'

export function RecentActivityCard( { activities }: { activities: Activity[] }) {
    return (
        <Card shadow="sm" p="lg" radius="md" withBorder>
            <Title order={3} mb="md">Recent Activity</Title>
            <List spacing="xs" size="sm" center>
                {activities.map((activity) => (
                    <List.Item key={activity.id}>
                        <b>{activity.title}</b> {activity.description}
                        <Text size="xs" c="dimmed">{formatTimestampRelative(activity.completeAt)}</Text>
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