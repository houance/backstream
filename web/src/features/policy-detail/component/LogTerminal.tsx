import { useEffect, useRef, useState } from 'react';
import { Box, ScrollArea, Group, Text, Button, Transition, rem } from '@mantine/core';
import { IconTerminal2, IconArrowDown } from '@tabler/icons-react';

export function LogTerminal({ logs }: { logs: string[] | undefined }) {
    const viewport = useRef<HTMLDivElement>(null);
    const [showJumpButton, setShowJumpButton] = useState(false);

    const scrollToBottom = () => {
        viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    };

    // 1. Auto-scroll on new logs
    useEffect(() => {
        // Only auto-scroll if the user is already near the bottom
        if (!showJumpButton) {
            scrollToBottom();
        }
    }, [logs, showJumpButton]);

    // 2. Track scroll position to show/hide button
    const handleScroll = (position: { y: number }) => {
        if (viewport.current) {
            const { scrollHeight, clientHeight } = viewport.current;
            const isAtBottom = scrollHeight - clientHeight - position.y < 50;
            setShowJumpButton(!isAtBottom);
        }
    };

    return (
        <Box p="md" bg="dark.8" pos="relative" style={{ borderRadius: '4px', border: '1px solid var(--mantine-color-dark-4)' }}>
            <Group mb="xs" gap="xs">
                <IconTerminal2 size={14} color="var(--mantine-color-gray-5)" />
                <Text size="xs" c="gray.5" ff="monospace" fw={700}>restic stdout</Text>
            </Group>

            <ScrollArea h={300} viewportRef={viewport} onScrollPositionChange={handleScroll}>
                {logs?.map((log, i) => (
                    <Text key={i} size="xs" ff="monospace" c="gray.3" style={{ lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--mantine-color-blue-4)' }}>{'>'}</span> {log}
                    </Text>
                ))}
            </ScrollArea>

            {/* 3. Jump to Bottom Button */}
            <Transition transition="slide-up" mounted={showJumpButton}>
                {(transitionStyles) => (
                    <Button
                        size="xs"
                        variant="filled"
                        color="gray"
                        leftSection={<IconArrowDown size={14} />}
                        onClick={scrollToBottom}
                        style={{
                            ...transitionStyles,
                            position: 'absolute',
                            bottom: rem(20),
                            left: '50%',
                            transform: 'translateX(-50%)',
                            boxShadow: 'var(--mantine-shadow-md)',
                            zIndex: 2,
                        }}
                    >
                        Jump to bottom
                    </Button>
                )}
            </Transition>
        </Box>
    );
}
