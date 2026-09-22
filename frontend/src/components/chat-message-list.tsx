import { Flex, Typography } from 'antd';
import { useEffect, useRef } from 'react';
import type { ReactElement, UIEvent } from 'react';

import ChatMessageItem from './chat-message-item.tsx';
import type { ChatMessage, ChatMessageListProps } from './interfaces.ts';

/** Distance from the bottom (px) within which the view still follows a streaming reply. */
const PINNED_THRESHOLD_PX: number = 40;

/**
 * The scrolling conversation. Follows the tail like the log panes do: streamed
 * fragments keep the view at the bottom only while the user has not scrolled
 * up, but a newly added message always snaps back down.
 */
function ChatMessageList(props: ChatMessageListProps): ReactElement {
    const pinnedToBottom = useRef<boolean>(true);
    const renderedCount = useRef<number>(0);
    const scrollContainer = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (props.messages.length > renderedCount.current) {
            /* The user just sent something — show it, wherever they had scrolled to. */
            pinnedToBottom.current = true;
        }
        renderedCount.current = props.messages.length;

        /* scrollTop moves this list only; it keeps working while the column is
           collapsed, so a reply that finishes unseen is at its end on reopen. */
        if (pinnedToBottom.current && scrollContainer.current !== null) {
            scrollContainer.current.scrollTop = scrollContainer.current.scrollHeight;
        }
    }, [props.messages]);

    function handleScroll(event: UIEvent<HTMLDivElement>): void {
        const target: HTMLDivElement = event.currentTarget;
        const distanceFromBottom: number = target.scrollHeight - target.scrollTop - target.clientHeight;
        pinnedToBottom.current = distanceFromBottom <= PINNED_THRESHOLD_PX;
    }

    let content: ReactElement;
    if (props.messages.length === 0) {
        content = (
            <Flex justify="center" align="center" style={{ height: '100%', textAlign: 'center' }}>
                <Typography.Text type="secondary">Ask about your services, images or builds.</Typography.Text>
            </Flex>
        );
    } else {
        content = (
            <Flex vertical gap={12}>
                {props.messages.map((message: ChatMessage) => (
                    <ChatMessageItem key={message.id} message={message} />
                ))}
            </Flex>
        );
    }

    return (
        <div
            ref={scrollContainer}
            onScroll={handleScroll}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}
        >
            {content}
        </div>
    );
}

export default ChatMessageList;
