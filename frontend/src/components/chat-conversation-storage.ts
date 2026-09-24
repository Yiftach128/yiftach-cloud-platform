import type { ChatMessage, ChatMessageStatus, ChatToolCall, ChatToolCallStatus } from './interfaces.ts';

/* The conversation, remembered for the life of the tab (sessionStorage): a
   reload keeps it, a new tab starts empty and closing the tab is the end of
   it. Per tab on purpose — two tabs of the app never overwrite each other's
   conversation, and a row opened with ctrl+click is a new working session.
   The backend keeps no conversation (a run takes the whole one), so this is
   the only copy. Every access is wrapped, because storage can be blocked or
   full, and a store that fails must cost nothing but the memory. What comes
   back is checked field by field: the key is versioned, but a hand-edited or
   half-written entry must never crash the first render. */

const STORAGE_KEY: string = 'ycp.assistantConversation.v1';

const MESSAGE_STATUSES: ChatMessageStatus[] = ['streaming', 'done', 'stopped', 'error'];
const TOOL_CALL_STATUSES: ChatToolCallStatus[] = ['running', 'done', 'error', 'stopped'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isStoredToolCall(value: unknown): value is ChatToolCall {
    if (!isRecord(value)) {
        return false;
    }
    const isStatus: boolean = TOOL_CALL_STATUSES.some((status: ChatToolCallStatus) => status === value.status);
    return (
        typeof value.callId === 'number' &&
        typeof value.name === 'string' &&
        isRecord(value.arguments) &&
        isStatus &&
        isOptionalString(value.resultText)
    );
}

function isStoredMessage(value: unknown): value is ChatMessage {
    if (!isRecord(value)) {
        return false;
    }
    const isRole: boolean = value.role === 'user' || value.role === 'assistant';
    const isStatus: boolean = MESSAGE_STATUSES.some((status: ChatMessageStatus) => status === value.status);
    const hasToolCalls: boolean = Array.isArray(value.toolCalls) && value.toolCalls.every(isStoredToolCall);
    return (
        typeof value.id === 'number' &&
        isRole &&
        typeof value.text === 'string' &&
        isStatus &&
        isOptionalString(value.errorMessage) &&
        hasToolCalls &&
        typeof value.hitModelCallLimit === 'boolean'
    );
}

/** The remembered conversation, or an empty one when there is none or it is unreadable. */
export function readStoredChatConversation(): ChatMessage[] {
    let raw: string | null;
    try {
        raw = window.sessionStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.warn('assistant conversation: storage unreadable', error);
        return [];
    }
    if (raw === null) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.warn('assistant conversation: stored entry is not JSON', error);
        return [];
    }
    if (!Array.isArray(parsed) || !parsed.every(isStoredMessage)) {
        console.warn('assistant conversation: stored entry has an unexpected shape, starting empty');
        return [];
    }
    return parsed;
}

export function storeChatConversation(messages: ChatMessage[]): void {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
        console.warn('assistant conversation: storage unwritable', error);
    }
}
