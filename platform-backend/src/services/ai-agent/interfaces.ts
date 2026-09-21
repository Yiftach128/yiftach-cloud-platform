/**
 * Public types for the AI agent — the loop that lets a language model answer a
 * chat by calling tools.
 *
 * The agent owns the `ToolProvider` contract and knows nothing about where
 * tools come from: `src/mcp/client/` implements it over MCP, a check script
 * implements it with canned results. That keeps this folder free of the MCP
 * SDK and of every other service folder except `llm/`.
 */

import type { LlmClient } from '../llm/interfaces.ts';

/** Who wrote one chat turn. */
export type ChatRole = 'user' | 'assistant';

/** One turn of the conversation, as the chat UI sends it (the frontend's `ChatTurn`). */
export interface ChatTurn {
    role: ChatRole;
    text: string;
}

/** A tool as the agent sees it. */
export interface AgentTool {
    name: string;
    description: string;
    /** JSON Schema of the arguments object. */
    inputSchema: Record<string, unknown>;
    /** True when the tool only reads. Read-only calls of one model turn run concurrently; anything else runs one at a time, in order. */
    readOnly: boolean;
}

/** What came back from one tool call. A failure is an outcome, not an exception: the model reads it and can correct itself. */
export interface ToolCallOutcome {
    text: string;
    isError: boolean;
}

/** Where the agent gets its tools — declared here, implemented by whoever has tools to offer. */
export interface ToolProvider {
    listTools(): Promise<AgentTool[]>;
    /** Guidance on using the tools together, written by whoever provides them; empty when there is none. */
    getUsageInstructions(): string;
    /**
     * Runs one tool. Failures the model can act on (unknown name, bad
     * arguments, the tool's own errors) come back in band with
     * `isError: true` rather than as a rejection.
     */
    callTool(name: string, toolArguments: Record<string, unknown>, signal: AbortSignal): Promise<ToolCallOutcome>;
}

/** A fragment of the model's text, as it is generated. */
export interface AgentTextDeltaEvent {
    type: 'delta';
    text: string;
}

/** The model asked for a tool; the call is about to run. */
export interface AgentToolCallEvent {
    type: 'tool_call';
    name: string;
    arguments: Record<string, unknown>;
}

/** A tool call finished; `text` is the result exactly as the model will read it (already trimmed). */
export interface AgentToolResultEvent {
    type: 'tool_result';
    name: string;
    isError: boolean;
    text: string;
}

/** What a run reports while it is in progress. */
export type AgentEvent = AgentTextDeltaEvent | AgentToolCallEvent | AgentToolResultEvent;

/**
 * Why a run ended: the model answered; the model-call cap was reached and the
 * last call was made without tools to force an answer; or the caller aborted.
 */
export type AgentStopReason = 'answered' | 'model_call_limit' | 'aborted';

/** One tool call the run made, in the order the model asked for it. */
export interface ExecutedToolCall {
    name: string;
    arguments: Record<string, unknown>;
    isError: boolean;
}

export interface AgentRunResult {
    /** The text of the model's last turn. */
    finalText: string;
    stopReason: AgentStopReason;
    toolCalls: ExecutedToolCall[];
    /** How many times the model was called. */
    modelCalls: number;
    /** The largest prompt of the run, in tokens — how close it came to the context window. */
    peakPromptTokens: number;
}

export interface ToolCallingChatOrchestratorOptions {
    llm: LlmClient;
    tools: ToolProvider;
    /** Cap on model calls per run; the last allowed call is made without tools. Defaults to 6. */
    maxModelCalls?: number;
    /** Cap on tool calls executed per model turn; the rest are refused in band. Defaults to 5. */
    maxToolCallsPerTurn?: number;
    /** Characters of tool results one run may put into the context window, shared by all its calls. Defaults to 12000. */
    toolResultBudgetChars?: number;
}
