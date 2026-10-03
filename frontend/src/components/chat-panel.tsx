import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ChatFetcherError } from '../fetchers/chat-fetcher-error.ts';
import type {
    ChatReplyEvent,
    ChatToolApprovalStreamEvent,
    ChatToolCallDecision,
    ChatToolCallStreamEvent,
    ChatToolResultStreamEvent,
    ChatTurn,
} from '../fetchers/interfaces.ts';
import { readStoredChatAutoApproveToolCalls, storeChatAutoApproveToolCalls } from './chat-auto-approve-storage.ts';
import ChatComposer from './chat-composer.tsx';
import { readStoredChatConversation, storeChatConversation } from './chat-conversation-storage.ts';
import ChatMessageList from './chat-message-list.tsx';
import type {
    ChatMessage,
    ChatMessageStatus,
    ChatPanelHandle,
    ChatPanelProps,
    ChatToolCall,
    ChatToolCallStatus,
} from './interfaces.ts';

/* A reply that failed or was stopped before its first fragment carries no
   text — there is nothing of it to send back. Tool calls are not sent back
   either: the backend reads the conversation as text turns only. */
function toTurns(messages: ChatMessage[]): ChatTurn[] {
    return messages
        .filter((message: ChatMessage) => message.text !== '')
        .map((message: ChatMessage) => ({ role: message.role, text: message.text }));
}

/* Ids are the sequence numbers of the list, so the next one follows the last
   message — which is how a restored conversation continues its numbering. */
function nextMessageIdAfter(messages: ChatMessage[]): number {
    const lastMessage: ChatMessage | undefined = messages[messages.length - 1];
    if (lastMessage === undefined) {
        return 1;
    }
    return lastMessage.id + 1;
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

function replaceToolCalls(reply: ChatMessage, toolCalls: ChatToolCall[]): ChatMessage {
    const changed: ChatMessage = {
        id: reply.id,
        role: reply.role,
        text: reply.text,
        status: reply.status,
        toolCalls: toolCalls,
        hitModelCallLimit: reply.hitModelCallLimit,
    };
    return changed;
}

/* A call that needs approval starts waiting; any other starts running. */
function addToolCall(reply: ChatMessage, event: ChatToolCallStreamEvent): ChatMessage {
    let status: ChatToolCallStatus;
    if (event.needsApproval) {
        status = 'awaiting';
    } else {
        status = 'running';
    }
    const started: ChatToolCall = {
        callId: event.callId,
        name: event.name,
        arguments: event.arguments,
        destructive: event.destructive,
        status: status,
    };
    return replaceToolCalls(reply, reply.toolCalls.concat([started]));
}

/* Approved: the call runs now. Denied: it never will — its error result follows, and must not turn it into a failure. */
function recordToolCallDecision(reply: ChatMessage, event: ChatToolApprovalStreamEvent): ChatMessage {
    let status: ChatToolCallStatus;
    if (event.decision === 'approved') {
        status = 'running';
    } else {
        status = 'denied';
    }
    const toolCalls: ChatToolCall[] = reply.toolCalls.map((call: ChatToolCall) => {
        if (call.callId !== event.callId) {
            return call;
        }
        const decided: ChatToolCall = {
            callId: call.callId,
            name: call.name,
            arguments: call.arguments,
            destructive: call.destructive,
            status: status,
        };
        return decided;
    });
    return replaceToolCalls(reply, toolCalls);
}

/* Matched by id, not position: the results of a concurrent batch arrive as they finish. */
function settleToolCall(reply: ChatMessage, event: ChatToolResultStreamEvent): ChatMessage {
    const toolCalls: ChatToolCall[] = reply.toolCalls.map((call: ChatToolCall) => {
        if (call.callId !== event.callId) {
            return call;
        }
        let resultStatus: ChatToolCallStatus;
        if (call.status === 'denied') {
            // The backend answers a denied call with an error result for the model; to the person it stays "denied".
            resultStatus = 'denied';
        } else if (event.isError) {
            resultStatus = 'error';
        } else {
            resultStatus = 'done';
        }
        const settled: ChatToolCall = {
            callId: call.callId,
            name: call.name,
            arguments: call.arguments,
            destructive: call.destructive,
            status: resultStatus,
            resultText: event.text,
        };
        return settled;
    });
    return replaceToolCalls(reply, toolCalls);
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
        } else if (event.type === 'tool_approval') {
            return recordToolCallDecision(message, event);
        } else if (event.type === 'tool_result') {
            return settleToolCall(message, event);
        } else {
            return recordModelCallLimit(message, event.stopReason === 'model_call_limit');
        }
    });
}

/* Ends one reply. A tool call still running has lost its result — the run
   was stopped or failed — so its tag stops spinning too; a call still waiting
   for approval has lost its question the same way. */
function settleMessage(message: ChatMessage, status: ChatMessageStatus, errorMessage: string | undefined): ChatMessage {
    const toolCalls: ChatToolCall[] = message.toolCalls.map((call: ChatToolCall) => {
        if (call.status !== 'running' && call.status !== 'awaiting') {
            return call;
        }
        const stopped: ChatToolCall = {
            callId: call.callId,
            name: call.name,
            arguments: call.arguments,
            destructive: call.destructive,
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
        return settleMessage(message, status, errorMessage);
    });
}

/* A restored conversation may hold a reply that was still streaming when the
   page went away. The reload closed the response, and the backend aborted the
   run on that close, so it is exactly the Stop case: what had arrived stays,
   the reply and its running or waiting tool calls are marked stopped. Nothing
   can be resumed — the backend keeps no run to reattach to. */
function settleInterruptedReplies(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message: ChatMessage) => {
        if (message.status !== 'streaming') {
            return message;
        }
        return settleMessage(message, 'stopped', undefined);
    });
}

function readInitialMessages(): ChatMessage[] {
    return settleInterruptedReplies(readStoredChatConversation());
}

/**
 * The conversation itself — messages plus composer — knowing nothing about
 * where it is mounted (chat-docked-column.tsx today). It owns the conversation
 * state, and its host collapses it instead of unmounting it, so closing the
 * chat loses neither the history nor a reply still streaming. The conversation
 * also outlives the page: it is written to the tab's storage on every change
 * and read back at mount (chat-conversation-storage.ts), so a reload keeps
 * it. What the host may ask of it is the `ChatPanelHandle` on its `ref`:
 * deleting the conversation, which stops a reply still streaming and empties
 * the list.
 *
 * A destructive tool call waits for Approve or Deny in its tag's
 * details block; the answer goes to the backend, and what the tag shows next
 * comes back on the reply's stream — the stream is the truth, the click only
 * a request. The composer's auto-approve switch, sent with every message,
 * asks the backend to skip that wait: the panel owns it like the
 * conversation, and remembers it per tab the same way.
 */
function ChatPanel(props: ChatPanelProps): ReactElement {
    const [messages, setMessages] = useState<ChatMessage[]>(readInitialMessages);
    const [isReplying, setIsReplying] = useState<boolean>(false);
    /* The composer's switch, kept beside the conversation it applies to and
       remembered per tab (chat-auto-approve-storage.ts). */
    const [autoApproveToolCalls, setAutoApproveToolCalls] = useState<boolean>(readStoredChatAutoApproveToolCalls);

    const activeReply = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            if (activeReply.current !== null) {
                activeReply.current.abort();
            }
        };
    }, []);

    /* Every change, streamed fragments included, so a reload mid-reply keeps
       what had arrived. The list stays small — tool results are budgeted by
       the backend — so serializing it per fragment costs nothing noticeable. */
    useEffect(() => {
        storeChatConversation(messages);
    }, [messages]);

    function handleStop(): void {
        if (activeReply.current !== null) {
            activeReply.current.abort();
        }
    }

    /* The aborted reply settles against the emptied list, which changes
       nothing there; sending stays blocked until it has. */
    function deleteConversation(): void {
        handleStop();
        setMessages([]);
    }

    useImperativeHandle(props.ref, () => {
        const handle: ChatPanelHandle = { deleteConversation: deleteConversation };
        return handle;
    });

    /* A refused answer (409: the call is no longer waiting — the reply was
       stopped, or already answered) needs no display of its own: the reply's
       stream, or its Stop, has already settled the tag. */
    function handleDecide(callId: number, decision: ChatToolCallDecision): void {
        props.fetcher.answerToolCall(callId, decision).catch((error: unknown) => {
            console.warn(`assistant: the answer to tool call #${callId} was not taken`, error);
        });
    }

    function handleAutoApproveToolCallsChange(autoApprove: boolean): void {
        setAutoApproveToolCalls(autoApprove);
        storeChatAutoApproveToolCalls(autoApprove);
    }

    async function handleSend(text: string): Promise<void> {
        if (isReplying) {
            return;
        }

        const userMessageId: number = nextMessageIdAfter(messages);
        const userMessage: ChatMessage = {
            id: userMessageId,
            role: 'user',
            text: text,
            status: 'done',
            toolCalls: [],
            hitModelCallLimit: false,
        };
        const replyId: number = userMessageId + 1;
        const replyMessage: ChatMessage = {
            id: replyId,
            role: 'assistant',
            text: '',
            status: 'streaming',
            toolCalls: [],
            hitModelCallLimit: false,
        };

        /* Sending is blocked while a reply streams, so `messages` cannot be
           stale here; the streaming updates below go through the functional
           setter because they do outlive this render. */
        const history: ChatMessage[] = messages.concat([userMessage]);
        setMessages(history.concat([replyMessage]));
        setIsReplying(true);

        const controller: AbortController = new AbortController();
        activeReply.current = controller;

        try {
            /* The switch is read when the message is sent: a flip while a reply
               streams applies to the next message, and a call already waiting
               keeps its Approve and Deny. */
            await props.fetcher.streamReply(
                { turns: toTurns(history), autoApproveToolCalls: autoApproveToolCalls },
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

    return (
        <>
            <ChatMessageList messages={messages} onDecide={handleDecide} />
            <ChatComposer
                open={props.open}
                replying={isReplying}
                autoApproveToolCalls={autoApproveToolCalls}
                onSend={handleSend}
                onStop={handleStop}
                onAutoApproveToolCallsChange={handleAutoApproveToolCallsChange}
            />
        </>
    );
}

export default ChatPanel;
