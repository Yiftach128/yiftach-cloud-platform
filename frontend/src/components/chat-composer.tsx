import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Flex, Input } from 'antd';
import type { GetRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';

import type { ChatComposerProps } from './interfaces.ts';

/**
 * The chat's input row: Enter sends, Shift+Enter breaks the line. Typing stays
 * possible while a reply streams — only sending waits, and the button becomes
 * Stop for that time.
 */
function ChatComposer(props: ChatComposerProps): ReactElement {
    const [draft, setDraft] = useState<string>('');
    const textArea = useRef<GetRef<typeof Input.TextArea> | null>(null);

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

    return (
        <Flex gap={8} align="flex-end" style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
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
    );
}

export default ChatComposer;
