import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ChatFetcherError } from '../fetchers/chat-fetcher-error.ts';
import type {
    ChatReplyEvent,
    ChatToolCallStreamEvent,
    ChatToolResultStreamEvent,
    ChatTurn,
} from '../fetchers/interfaces.ts';
import ChatComposer from './chat-composer.tsx';
import ChatMessageList from './chat-message-list.tsx';
import type { ChatMessage, ChatMessageStatus, ChatPanelProps, ChatToolCall, ChatToolCallStatus } from './interfaces.ts';

/* A reply that failed or was stopped before its first fragment carries no
   text — there is nothing of it to send back. Tool calls are not sent back
   either: the backend reads the conversation as text turns only. */
function toTurns(messages: ChatMessage[]): ChatTurn[] {
    return messages
        .filter((message: ChatMessage) => message.text !== '')
        .map((message: ChatMessage) => ({ role: message.role, text: message.text }));
}

function appendReplyText(reply: ChatMessage, textDelta: string): ChatMessage {
    const grown: ChatMessage = {
        id: reply.id,
        role: reply.role,
        text: reply.text + textDelta,
        status: reply.status,
        toolCalls: reply.toolCalls,
        hitModelCallLimit: reply.hitModelCallLimit,
    };
    return grown;
}

function addToolCall(reply: ChatMessage, event: ChatToolCallStreamEvent): ChatMessage {
    const started: ChatToolCall = {
        callId: event.callId,
        name: event.name,
        arguments: event.arguments,
        status: 'running',
    };
    const withCall: ChatMessage = {
        id: reply.id,
        role: reply.role,
        text: reply.text,
        status: reply.status,
        toolCalls: reply.toolCalls.concat([started]),
        hitModelCallLimit: reply.hitModelCallLimit,
    };
    return withCall;
}

/* Matched by id, not position: the results of a concurrent batch arrive as they finish. */
function settleToolCall(reply: ChatMessage, event: ChatToolResultStreamEvent): ChatMessage {
    let resultStatus: ChatToolCallStatus;
    if (event.isError) {
        resultStatus = 'error';
    } else {
        resultStatus = 'done';
    }
    const toolCalls: ChatToolCall[] = reply.toolCalls.map((call: ChatToolCall) => {
        if (call.callId !== event.callId) {
            return call;
        }
        const settled: ChatToolCall = {
            callId: call.callId,
            name: call.name,
            arguments: call.arguments,
            status: resultStatus,
            resultText: event.text,
        };
        return settled;
    });
    const withResult: ChatMessage = {
        id: reply.id,
        role: reply.role,
        text: reply.text,
        status: reply.status,
        toolCalls: toolCalls,
        hitModelCallLimit: reply.hitModelCallLimit,
    };
    return withResult;
}

/* Of `done`, the UI shows one thing: whether the model-call cap cut the run short. */
function recordModelCallLimit(reply: ChatMessage, hitModelCallLimit: boolean): ChatMessage {
    const recorded: ChatMessage = {
        id: reply.id,
        role: reply.role,
        text: reply.text,
        status: reply.status,
        toolCalls: reply.toolCalls,
        hitModelCallLimit: hitModelCallLimit,
    };
    return recorded;
}

/** Folds one streamed event into the reply it belongs to. */
function applyReplyEvent(messages: ChatMessage[], replyId: number, event: ChatReplyEvent): ChatMessage[] {
    return messages.map((message: ChatMessage) => {
        if (message.id !== replyId) {
            return message;
        }
        if (event.type === 'delta') {
            return appendReplyText(message, event.text);
        } else if (event.type === 'tool_call') {
            return addToolCall(message, event);
        } else if (event.type === 'tool_result') {
            return settleToolCall(message, event);
        } else {
            return recordModelCallLimit(message, event.stopReason === 'model_call_limit');
        }
    });
}

/* Ends the reply. A tool call still running has lost its result — the run
   was stopped or failed — so its tag stops spinning too. */
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
        const toolCalls: ChatToolCall[] = message.toolCalls.map((call: ChatToolCall) => {
            if (call.status !== 'running') {
                return call;
            }
            const stopped: ChatToolCall = {
                callId: call.callId,
                name: call.name,
                arguments: call.arguments,
                status: 'stopped',
            };
            return stopped;
        });
        const settled: ChatMessage = {
            id: message.id,
            role: message.role,
            text: message.text,
            status: status,
            errorMessage: errorMessage,
            toolCalls: toolCalls,
            hitModelCallLimit: message.hitModelCallLimit,
        };
        return settled;
    });
}

/**
 * The conversation itself — messages plus composer — knowing nothing about
 * where it is mounted (chat-docked-column.tsx today). It owns the conversation state,
 * and its host collapses it instead of unmounting it, so closing the chat loses
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

        const userMessage: ChatMessage = {
            id: nextMessageId.current,
            role: 'user',
            text: text,
            status: 'done',
            toolCalls: [],
            hitModelCallLimit: false,
        };
        const replyId: number = nextMessageId.current + 1;
        const replyMessage: ChatMessage = {
            id: replyId,
            role: 'assistant',
            text: '',
            status: 'streaming',
            toolCalls: [],
            hitModelCallLimit: false,
        };
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
                (event: ChatReplyEvent) => {
                    setMessages((current: ChatMessage[]) => applyReplyEvent(current, replyId, event));
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
