import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Flex, Input, Switch, Typography, theme } from 'antd';
import type { GetRef, ThemeConfig } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, KeyboardEvent, ReactElement } from 'react';

import type { ChatComposerProps } from './interfaces.ts';

const AUTO_APPROVE_SWITCH_ID: string = 'assistant-auto-approve-tool-calls';

/* The two divider lines: one under the messages, one between the switch row and the text field. */
const DIVIDER: string = '1px solid #f0f0f0';

const autoApproveRowStyle: CSSProperties = {
    padding: '8px 12px',
    borderTop: DIVIDER,
};

const inputRowStyle: CSSProperties = {
    padding: 12,
    borderTop: DIVIDER,
};

const autoApproveLabelStyle: CSSProperties = {
    fontSize: 12,
    cursor: 'pointer',
};

/**
 * The chat's input area: Enter sends, Shift+Enter breaks the line. Typing stays
 * possible while a reply streams — only sending waits, and the button becomes
 * Stop for that time.
 *
 * Between the messages and the text field, framed by a divider line on each
 * side, sits the auto-approve switch: on, the assistant's stop, restart and
 * delete calls run without Approve/Deny, which the label says in the warning
 * color for as long as it is on. It stays enabled while a reply streams — a
 * flip applies to the next message, and a call already waiting keeps its
 * buttons.
 */
function ChatComposer(props: ChatComposerProps): ReactElement {
    const [draft, setDraft] = useState<string>('');
    const textArea = useRef<GetRef<typeof Input.TextArea> | null>(null);
    const { token } = theme.useToken();

    useEffect(() => {
        if (props.open && textArea.current !== null) {
            textArea.current.focus();
        }
    }, [props.open]);

    function submitDraft(): void {
        const text: string = draft.trim();
        if (text === '' || props.replying) {
            return;
        }
        props.onSend(text);
        setDraft('');
        /* A click on Send moved the focus to the button — hand it back. */
        if (textArea.current !== null) {
            textArea.current.focus();
        }
    }

    function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
        setDraft(event.target.value);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
        /* While an IME composes, Enter confirms a candidate — not a send. */
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
            return;
        }
        event.preventDefault();
        submitDraft();
    }

    let actionButton: ReactElement;
    if (props.replying) {
        actionButton = <Button aria-label="Stop" title="Stop" icon={<BorderOutlined />} onClick={props.onStop} />;
    } else {
        actionButton = (
            <Button
                type="primary"
                aria-label="Send"
                title="Send"
                icon={<SendOutlined />}
                disabled={draft.trim() === ''}
                onClick={submitDraft}
            />
        );
    }

    /* antd's Switch takes its "on" color from colorPrimary — grey in this app.
       A mode that lets the assistant stop and delete unasked wants the warning
       color instead, so the switch gets that token as its own primary. */
    const autoApproveSwitchTheme: ThemeConfig = {
        components: {
            Switch: {
                colorPrimary: token.colorWarning,
                colorPrimaryHover: token.colorWarningHover,
            },
        },
    };

    let autoApproveLabel: ReactElement;
    if (props.autoApproveToolCalls) {
        autoApproveLabel = (
            <Typography.Text type="warning" style={autoApproveLabelStyle}>
                Auto-approve on
            </Typography.Text>
        );
    } else {
        autoApproveLabel = (
            <Typography.Text type="secondary" style={autoApproveLabelStyle}>
                Auto-approve
            </Typography.Text>
        );
    }

    return (
        <div>
            <Flex gap={8} align="center" style={autoApproveRowStyle}>
                <ConfigProvider theme={autoApproveSwitchTheme}>
                    <Switch
                        id={AUTO_APPROVE_SWITCH_ID}
                        size="small"
                        checked={props.autoApproveToolCalls}
                        onChange={props.onAutoApproveToolCallsChange}
                    />
                </ConfigProvider>
                <label htmlFor={AUTO_APPROVE_SWITCH_ID}>{autoApproveLabel}</label>
            </Flex>
            <Flex gap={8} align="flex-end" style={inputRowStyle}>
                <Input.TextArea
                    ref={textArea}
                    value={draft}
                    placeholder="Message the assistant…"
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />
                {actionButton}
            </Flex>
        </div>
    );
}

export default ChatComposer;
