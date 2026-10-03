import { Button, Flex, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { ChatToolCall, ChatToolCallApprovalRowProps } from './interfaces.ts';

const questionStyle: CSSProperties = {
    fontSize: 12,
};

/**
 * The ask under the tag row while one call waits for the person: a short line
 * and Approve / Deny. It is a row of its own rather than part of the tag's
 * details block, so that no tag has to open by itself for the ask to be seen
 * — the details stay collapsed until clicked, and the arguments are one click
 * away on the waiting tag (the one with the question mark). Approve is red,
 * and says so, because every call that waits is destructive. The buttons
 * disable on the first click; what the call becomes next is told by the
 * reply's stream, not by the click. Mounted per waiting call (its host keys it
 * by `callId`), so the disabled state never carries over to the next ask.
 */
function ChatToolCallApprovalRow(props: ChatToolCallApprovalRowProps): ReactElement {
    const call: ChatToolCall = props.toolCall;
    const [decided, setDecided] = useState<boolean>(false);

    let approveLabel: string;
    if (call.destructive) {
        approveLabel = 'Approve (destructive)';
    } else {
        approveLabel = 'Approve';
    }

    function decide(decision: 'approved' | 'denied'): void {
        setDecided(true);
        props.onDecide(call.callId, decision);
    }

    return (
        <Flex wrap gap={8} align="center">
            <Typography.Text type="secondary" style={questionStyle}>
                Waiting for your approval
            </Typography.Text>
            <Button
                size="small"
                type="primary"
                danger={call.destructive}
                disabled={decided}
                onClick={() => decide('approved')}
            >
                {approveLabel}
            </Button>
            <Button size="small" disabled={decided} onClick={() => decide('denied')}>
                Deny
            </Button>
        </Flex>
    );
}

export default ChatToolCallApprovalRow;
