import {Badge, Card, Group, List, Text, Title} from "@mantine/core";
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
                        {/* 1. Group ensures children stay on one horizontal line */}
                        <Group gap="xs" mt={4} wrap="nowrap" align="center">
                            {/* 2. span={true} changes <p> to <span> to prevent block behavior */}
                            <Text size="xs" c="dimmed" span>
                                {formatTimestampRelative(activity.completeAt)}
                            </Text>
                            {/* 3. Badge will now sit next to the span Text */}
                            {activity.level === "WARN" && (
                                <Badge color="yellow" size="xs">Alert</Badge>
                            )}
                            {activity.level === "ALERT" && (
                                <Badge color="red" size="xs">Alert</Badge>
                            )}
                        </Group>
                    </List.Item>
                ))}
            </List>
        </Card>
    )
}