import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ChatFetcherError } from '../fetchers/chat-fetcher-error.ts';
import type { ChatTurn } from '../fetchers/interfaces.ts';
import ChatComposer from './chat-composer.tsx';
import ChatMessageList from './chat-message-list.tsx';
import type { ChatMessage, ChatMessageStatus, ChatPanelProps } from './interfaces.ts';

/* A reply that failed or was stopped before its first fragment carries no
   text — there is nothing of it to send back. */
function toTurns(messages: ChatMessage[]): ChatTurn[] {
    return messages
        .filter((message: ChatMessage) => message.text !== '')
        .map((message: ChatMessage) => ({ role: message.role, text: message.text }));
}

function appendReplyText(messages: ChatMessage[], replyId: number, textDelta: string): ChatMessage[] {
    return messages.map((message: ChatMessage) => {
        if (message.id !== replyId) {
            return message;
        }
        const grown: ChatMessage = {
            id: message.id,
            role: message.role,
            text: message.text + textDelta,
            status: message.status,
        };
        return grown;
    });
}

function settleReply(
    messages: ChatMessage[],
    replyId: number,
    status: ChatMessageStatus,
    errorMessage: string | undefined,
): ChatMessage[] {
    return messages.map((message: ChatMessage) => {
        if (message.id !== replyId) {
            return message;
        }
        const settled: ChatMessage = {
            id: message.id,
            role: message.role,
            text: message.text,
            status: status,
            errorMessage: errorMessage,
        };
        return settled;
    });
}

/**
 * The conversation itself — messages plus composer — knowing nothing about
 * where it is mounted (chat-bubble.tsx today). It owns the conversation state,
 * and its host hides it instead of unmounting it, so closing the chat loses
 * neither the history nor a reply still streaming.
 */
function ChatPanel(props: ChatPanelProps): ReactElement {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isReplying, setIsReplying] = useState<boolean>(false);

    const nextMessageId = useRef<number>(1);
    const activeReply = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            if (activeReply.current !== null) {
                activeReply.current.abort();
            }
        };
    }, []);

    async function handleSend(text: string): Promise<void> {
        if (isReplying) {
            return;
        }

        const userMessage: ChatMessage = { id: nextMessageId.current, role: 'user', text: text, status: 'done' };
        const replyId: number = nextMessageId.current + 1;
        const replyMessage: ChatMessage = { id: replyId, role: 'assistant', text: '', status: 'streaming' };
        nextMessageId.current = nextMessageId.current + 2;

        /* Sending is blocked while a reply streams, so `messages` cannot be
           stale here; the streaming updates below go through the functional
           setter because they do outlive this render. */
        const history: ChatMessage[] = messages.concat([userMessage]);
        setMessages(history.concat([replyMessage]));
        setIsReplying(true);

        const controller: AbortController = new AbortController();
        activeReply.current = controller;

        try {
            await props.fetcher.streamReply(
                toTurns(history),
                (textDelta: string) => {
                    setMessages((current: ChatMessage[]) => appendReplyText(current, replyId, textDelta));
                },
                controller.signal,
            );

            let finalStatus: ChatMessageStatus;
            if (controller.signal.aborted) {
                finalStatus = 'stopped';
            } else {
                finalStatus = 'done';
            }
            setMessages((current: ChatMessage[]) => settleReply(current, replyId, finalStatus, undefined));
        } catch (error) {
            let errorMessage: string;
            if (error instanceof ChatFetcherError) {
                errorMessage = error.message;
            } else {
                errorMessage = 'Unexpected error while waiting for the reply';
            }
            setMessages((current: ChatMessage[]) => settleReply(current, replyId, 'error', errorMessage));
        } finally {
            activeReply.current = null;
            setIsReplying(false);
        }
    }

    function handleStop(): void {
        if (activeReply.current !== null) {
            activeReply.current.abort();
        }
    }

    return (
        <>
            <ChatMessageList messages={messages} />
            <ChatComposer open={props.open} replying={isReplying} onSend={handleSend} onStop={handleStop} />
        </>
    );
}

export default ChatPanel;
