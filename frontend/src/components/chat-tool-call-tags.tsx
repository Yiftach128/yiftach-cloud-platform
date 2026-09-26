import {
    CheckOutlined,
    CloseOutlined,
    LoadingOutlined,
    MinusOutlined,
    QuestionCircleOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { Flex, Tag } from 'antd';
import { useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

import ChatToolCallApprovalRow from './chat-tool-call-approval-row.tsx';
import ChatToolCallDetails from './chat-tool-call-details.tsx';
import { formatToolCallLabel } from './chat-tool-call-formatters.ts';
import type { ChatToolCall, ChatToolCallStatus, ChatToolCallTagsProps } from './interfaces.ts';

/* antd gives a Tag a trailing margin for use in running text; here the row's
   gap spaces them. Monospace, because the label is a tool name and its
   arguments. A Tag never wraps, so a long label is cut with an ellipsis at
   the row's width instead of widening the column — the full label is the
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
    if (status === 'awaiting') {
        return 'warning';
    } else if (status === 'running') {
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
    if (status === 'awaiting') {
        return <QuestionCircleOutlined />;
    } else if (status === 'running') {
        return <LoadingOutlined spin />;
    } else if (status === 'done') {
        return <CheckOutlined />;
    } else if (status === 'error') {
        return <CloseOutlined />;
    } else if (status === 'denied') {
        return <StopOutlined />;
    } else {
        return <MinusOutlined />;
    }
}

/** The call waiting for the person's answer, if any — the loop asks one at a time, so there is at most one. */
function findAwaitingCall(toolCalls: ChatToolCall[]): ChatToolCall | undefined {
    return toolCalls.find((call: ChatToolCall) => call.status === 'awaiting');
}

/**
 * The tool calls of one reply as a row of tags, in the order the model asked:
 * a question mark while a call waits for approval, a spinner while it runs, a
 * check or a cross once its result is in, a stop sign when it was denied, a
 * dash when the reply ended first. Each tag is a button: clicking it (or
 * Enter/Space) opens the call's arguments and result below the row, one call
 * at a time; clicking it again closes them. No tag opens by itself: while a
 * call waits for approval, the ask is a row of its own under the tags
 * (chat-tool-call-approval-row.tsx), so the details stay closed until
 * clicked.
 */
function ChatToolCallTags(props: ChatToolCallTagsProps): ReactElement {
    const [expandedCallId, setExpandedCallId] = useState<number | null>(null);

    const awaitingCall: ChatToolCall | undefined = findAwaitingCall(props.toolCalls);
    let approvalRow: ReactElement | null = null;
    if (awaitingCall !== undefined) {
        // Keyed by the call, so a new ask gets fresh, enabled buttons.
        approvalRow = (
            <ChatToolCallApprovalRow key={awaitingCall.callId} toolCall={awaitingCall} onDecide={props.onDecide} />
        );
    }

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
            {approvalRow}
            {details}
        </Flex>
    );
}

export default ChatToolCallTags;
