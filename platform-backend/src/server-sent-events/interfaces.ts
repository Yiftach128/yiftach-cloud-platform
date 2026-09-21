/**
 * The events of a streamed chat reply (POST /chat), as they go over the wire.
 *
 * While the agent works, its own `AgentEvent`s are sent as they are (`delta`,
 * `tool_call`, `tool_result`). Exactly one of the two events declared here
 * ends the stream. Every event's data carries its `type`, which is also the
 * SSE event name. The frontend mirrors these in `fetchers/interfaces.ts`.
 */

import type { AgentEvent, AgentStopReason } from '../services/ai-agent/interfaces.ts';

/** The run ended normally; the text already streamed is the reply. */
export interface ChatDoneEvent {
    type: 'done';
    stopReason: AgentStopReason;
    /** How many times the model was called. */
    modelCalls: number;
    /** The largest prompt of the run, in tokens — how close it came to the context window. */
    peakPromptTokens: number;
}

/** What failed: the model server is unreachable, the model server refused the request, or anything else. */
export type ChatErrorCode = 'llm_unavailable' | 'llm_request_failed' | 'internal';

/** The run failed after the stream had opened, where an HTTP status can no longer say so. */
export interface ChatErrorEvent {
    type: 'error';
    code: ChatErrorCode;
    /** Written for the person chatting. */
    message: string;
}

export type ChatStreamEvent = AgentEvent | ChatDoneEvent | ChatErrorEvent;
