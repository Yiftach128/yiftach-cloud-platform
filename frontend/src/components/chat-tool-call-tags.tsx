import { CheckOutlined, CloseOutlined, LoadingOutlined, MinusOutlined } from '@ant-design/icons';
import { Flex, Tag } from 'antd';
import { useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

import ChatToolCallDetails from './chat-tool-call-details.tsx';
import { formatToolCallLabel } from './chat-tool-call-formatters.ts';
import type { ChatToolCall, ChatToolCallStatus, ChatToolCallTagsProps } from './interfaces.ts';

/* antd gives a Tag a trailing margin for use in running text; here the row's
   gap spaces them. Monospace, because the label is a tool name and its
   arguments. A Tag never wraps, so a long label is cut with an ellipsis at
   the row's width instead of widening the card — the full label is the
   tag's hover title, and the arguments are one click away. */
const tagStyle: CSSProperties = {
    marginInlineEnd: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    fontFamily: 'ui-monospace, Consolas, monospace',
};

function tagColor(status: ChatToolCallStatus): string {
    if (status === 'running') {
        return 'processing';
    } else if (status === 'done') {
        return 'success';
    } else if (status === 'error') {
        return 'error';
    } else {
        return 'default';
    }
}

function tagIcon(status: ChatToolCallStatus): ReactElement {
    if (status === 'running') {
        return <LoadingOutlined spin />;
    } else if (status === 'done') {
        return <CheckOutlined />;
    } else if (status === 'error') {
        return <CloseOutlined />;
    } else {
        return <MinusOutlined />;
    }
}

/**
 * The tool calls of one reply as a row of tags, in the order the model asked:
 * a spinner while a call runs, a check or a cross once its result is in, a
 * dash when the reply ended first. Each tag is a button: clicking it (or
 * Enter/Space) opens the call's arguments and result below the row, one call
 * at a time; clicking it again closes them.
 */
function ChatToolCallTags(props: ChatToolCallTagsProps): ReactElement {
    const [expandedCallId, setExpandedCallId] = useState<number | null>(null);

    function toggleExpanded(callId: number): void {
        setExpandedCallId((current: number | null) => {
            if (current === callId) {
                return null;
            }
            return callId;
        });
    }

    function handleTagKeyDown(event: KeyboardEvent<HTMLSpanElement>, callId: number): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleExpanded(callId);
        }
    }

    const expandedCall: ChatToolCall | undefined = props.toolCalls.find(
        (call: ChatToolCall) => call.callId === expandedCallId,
    );
    let details: ReactElement | null = null;
    if (expandedCall !== undefined) {
        details = <ChatToolCallDetails toolCall={expandedCall} />;
    }

    return (
        <Flex vertical gap={6}>
            <Flex wrap gap={4}>
                {props.toolCalls.map((call: ChatToolCall) => {
                    const isExpanded: boolean = call.callId === expandedCallId;
                    let variant: 'filled' | 'solid';
                    if (isExpanded) {
                        variant = 'solid';
                    } else {
                        variant = 'filled';
                    }
                    const label: string = formatToolCallLabel(call.name, call.arguments);
                    return (
                        <Tag
                            key={call.callId}
                            color={tagColor(call.status)}
                            variant={variant}
                            icon={tagIcon(call.status)}
                            style={tagStyle}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            title={label}
                            onClick={() => toggleExpanded(call.callId)}
                            onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => handleTagKeyDown(event, call.callId)}
                        >
                            {label}
                        </Tag>
                    );
                })}
            </Flex>
            {details}
        </Flex>
    );
}

export default ChatToolCallTags;
