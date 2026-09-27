/**
 * Public types of the chat traces: the on-disk record of one agent run, kept so
 * that a model call can be replayed exactly as it was made.
 *
 * A trace is one JSON-lines file per run — one record per line: a `run_start`
 * first, then a `model_call` per call to the model interleaved with the run's
 * tool `event`s, and a `run_end` or a `run_failed` last. The records are typed
 * here so the tracer and its readers (the evals' replay script) agree on the
 * format; a reader picks each line's shape by `type`.
 */

import type {
    AgentStopReason,
    AgentToolApprovalEvent,
    AgentToolCallEvent,
    AgentToolResultEvent,
    ChatTurn,
    ExecutedToolCall,
} from '../ai-agent/interfaces.ts';
import type { LlmMessage, LlmReply, LlmToolDefinition } from '../llm/interfaces.ts';

/** The header: what every model call of the run starts from. */
export interface ChatTraceRunStartRecord {
    type: 'run_start';
    runId: string;
    /** ISO timestamp. */
    startedAt: string;
    /** The model that answered and its context window: a trace from another model is not comparable. */
    model: string;
    contextTokens: number;
    autoApproveToolCalls: boolean;
    /** The conversation as the request carried it — before the history window chose what the model reads. */
    turns: ChatTurn[];
    /** The tool catalog as offered, written once; a `model_call` says only whether it was offered. */
    tools: LlmToolDefinition[];
}

/** One call to the model, with the exact prompt it read. */
export interface ChatTraceModelCallRecord {
    type: 'model_call';
    /** Numbers the run's model calls from 1. */
    callNumber: number;
    endedAt: string;
    durationMs: number;
    /** False on the capped last call, which is made without tools to force an answer. */
    toolsOffered: boolean;
    /** The messages exactly as sent: the system prompt, the windowed conversation, the trimmed tool results. */
    messages: LlmMessage[];
    reply: LlmReply;
    /** True when the run was aborted while this call streamed, so the reply is what had arrived. */
    aborted: boolean;
}

/** A tool event as the run reported it. Text deltas are not recorded: the reply holds the text whole. */
export interface ChatTraceEventRecord {
    type: 'event';
    at: string;
    event: AgentToolCallEvent | AgentToolApprovalEvent | AgentToolResultEvent;
}

/** The run ended the normal way: answered, capped, or aborted. */
export interface ChatTraceRunEndRecord {
    type: 'run_end';
    endedAt: string;
    durationMs: number;
    stopReason: AgentStopReason;
    modelCalls: number;
    peakPromptTokens: number;
    toolCalls: ExecutedToolCall[];
}

/** The run rejected — the model server failed or went silent. */
export interface ChatTraceRunFailedRecord {
    type: 'run_failed';
    endedAt: string;
    durationMs: number;
    errorName: string;
    message: string;
}

export type ChatTraceRecord =
    | ChatTraceRunStartRecord
    | ChatTraceModelCallRecord
    | ChatTraceEventRecord
    | ChatTraceRunEndRecord
    | ChatTraceRunFailedRecord;

export interface ChatTracerOptions {
    /** Folder the trace files go in, created on the first run. Empty means no traces are kept. */
    directory: string;
    /** Written into every trace's header. */
    model: string;
    contextTokens: number;
}
