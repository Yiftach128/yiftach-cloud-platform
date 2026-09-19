import { Alert, Flex, Typography } from 'antd';
import type { CSSProperties, ReactElement } from 'react';

import type { ChatMessage, ChatMessageItemProps } from './interfaces.ts';

/* pre-wrap keeps the reply's own line breaks; anywhere-wrapping stops a long
   token (an image digest, a URL) from widening the card. */
const messageTextStyle: CSSProperties = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
};

const userMessageStyle: CSSProperties = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxWidth: '85%',
    padding: '6px 10px',
    background: '#f0f0f0',
};

/**
 * One chat message. User messages sit right in a grey block; assistant replies
 * run full-width as plain text, which suits long answers in a narrow card. The
 * .app-chat-message class opts the text back into selection (index.css).
 */
function ChatMessageItem(props: ChatMessageItemProps): ReactElement {
    const message: ChatMessage = props.message;

    if (message.role === 'user') {
        return (
            <Flex justify="flex-end">
                <div className="app-chat-message" style={userMessageStyle}>{message.text}</div>
            </Flex>
        );
    }

    let replyText: ReactElement | null = null;
    if (message.text !== '') {
        replyText = <div className="app-chat-message" style={messageTextStyle}>{message.text}</div>;
    } else if (message.status === 'streaming') {
        /* Nothing has arrived yet. */
        replyText = <Typography.Text type="secondary">Thinking…</Typography.Text>;
    }

    let statusNote: ReactElement | null = null;
    if (message.status === 'stopped') {
        statusNote = <Typography.Text type="secondary" style={{ fontSize: 12 }}>Stopped</Typography.Text>;
    } else if (message.status === 'error') {
        /* Whatever streamed before the failure stays above the alert. */
        statusNote = <Alert type="error" showIcon message={message.errorMessage} />;
    }

    return (
        <Flex vertical gap={6}>
            {replyText}
            {statusNote}
        </Flex>
    );
}

export default ChatMessageItem;
