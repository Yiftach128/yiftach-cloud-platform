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

/** What one run is asked to do: the conversation, and whether its destructive tool calls may run unasked. */
export interface AgentRunRequest {
    /** The whole conversation, the question being asked as its last turn. */
    turns: ChatTurn[];
    /**
     * True runs destructive tool calls without asking the approver — the
     * person's own choice, made in the chat before sending (its auto-approve
     * switch) and sent with each message, so the mode belongs to the request
     * and nothing persists here. Such calls still report `destructive` and
     * are recorded as `auto_approved`, so what ran unasked stays visible.
     */
    autoApproveToolCalls: boolean;
}

/** A tool as the agent sees it. */
export interface AgentTool {
    name: string;
    description: string;
    /** JSON Schema of the arguments object. */
    inputSchema: Record<string, unknown>;
    /**
     * True when the tool only reads. Read-only calls of one model turn run
     * concurrently; anything else runs one at a time, in order.
     */
    readOnly: boolean;
    /**
     * True when the tool may interrupt or destroy something (stop, restart,
     * delete) rather than only add (start, create). Never true for a read-only
     * tool. It decides whether the user is asked: a destructive call runs only
     * after the user has approved it (`ToolCallApprover`), a call that only
     * adds runs at once, since what it added is undone by a stop or a delete,
     * which will be asked.
     */
    destructive: boolean;
}

/** The user's answer to "may this tool call run?". */
export type ToolCallDecision = 'approved' | 'denied';

/** A tool call that waits for the user's consent before it runs. */
export interface ToolCallApprovalRequest {
    /** The call's id within its run, as the `tool_call` event reported it. */
    callId: number;
    name: string;
    arguments: Record<string, unknown>;
    /** The tool's `destructive` flag: the reason the call is asked. */
    destructive: boolean;
}

/** The user's answer to one `ToolCallApprovalRequest`, as it arrives from the chat UI. */
export interface ToolCallApprovalAnswer {
    callId: number;
    decision: ToolCallDecision;
}

/**
 * Who decides whether a destructive tool call may run — declared
 * here, implemented by the host: the chat service asks the person in the chat
 * (`ToolCallApprovalGate`), a terminal script asks on the terminal, the
 * tool-choice check approves everything since nothing there executes. The
 * loop asks once per call, one call at a time, before the call runs.
 */
export interface ToolCallApprover {
    /**
     * Resolves with the decision. When `signal` aborts while the call is still
     * waiting, resolves with 'denied': the run is over and nothing may run.
     */
    requestApproval(request: ToolCallApprovalRequest, signal: AbortSignal): Promise<ToolCallDecision>;
}

/** The waiting answer the approval gate holds for one call. */
export interface PendingToolCallApproval {
    callId: number;
    resolve: (decision: ToolCallDecision) => void;
}

/**
 * What the loop remembers about one run's tool calls in order to refuse
 * repeats: the calls it already executed, and the calls the user denied (asked
 * for again, those are refused without asking the user again). Keyed by tool
 * name plus arguments.
 */
export interface RunToolCallLedger {
    executedCallKeys: Set<string>;
    deniedCallKeys: Set<string>;
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

/** The model asked for a tool; the call is about to run — or, when it needs approval, about to wait for it. */
export interface AgentToolCallEvent {
    type: 'tool_call';
    /** Numbers the run's tool calls from 1 in the order the model asked for them; the call's later events carry the same id. */
    callId: number;
    name: string;
    arguments: Record<string, unknown>;
    /**
     * True when the call waits for the user's approval; a `tool_approval` event
     * then says what was decided. False for a destructive call of a run that
     * auto-approves — `destructive` still says what it is.
     */
    needsApproval: boolean;
    /** The tool's `destructive` flag — what makes a call wait for approval, unless the run auto-approves. False for an unknown tool. */
    destructive: boolean;
}

/** The user decided about a call that needed approval. A denied call still gets a `tool_result` (an error), so every call has one. */
export interface AgentToolApprovalEvent {
    type: 'tool_approval';
    callId: number;
    name: string;
    decision: ToolCallDecision;
}

/**
 * A tool call finished; `text` is the result exactly as the model will read it
 * (already trimmed). `callId` names the `tool_call` it answers — the results of
 * a concurrent batch arrive in the order they finished, not the order asked.
 */
export interface AgentToolResultEvent {
    type: 'tool_result';
    callId: number;
    name: string;
    isError: boolean;
    text: string;
}

/** What a run reports while it is in progress. */
export type AgentEvent = AgentTextDeltaEvent | AgentToolCallEvent | AgentToolApprovalEvent | AgentToolResultEvent;

/**
 * Why a run ended: the model answered; the model-call cap was reached and the
 * last call was made without tools to force an answer; or the caller aborted.
 */
export type AgentStopReason = 'answered' | 'model_call_limit' | 'aborted';

/**
 * How a call stood with the user: no consent was needed (a tool that destroys
 * nothing), the user approved it, the run's auto-approve mode ran it unasked,
 * or the user denied it and it did not run.
 */
export type ToolCallApprovalOutcome = 'not_needed' | 'approved' | 'auto_approved' | 'denied';

/** One tool call the run made, in the order the model asked for it. */
export interface ExecutedToolCall {
    name: string;
    arguments: Record<string, unknown>;
    isError: boolean;
    /** The result exactly as the model read it (already trimmed). */
    resultText: string;
    approval: ToolCallApprovalOutcome;
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
    /** Asked before any destructive call runs. */
    approver: ToolCallApprover;
    /** Cap on model calls per run; the last allowed call is made without tools. Defaults to 6. */
    maxModelCalls?: number;
    /** Cap on tool calls executed per model turn; the rest are refused in band. Defaults to 5. */
    maxToolCallsPerTurn?: number;
    /** Characters of tool results one run may put into the context window, shared by all its calls. Defaults to 12000. */
    toolResultBudgetChars?: number;
    /** Characters of conversation the model reads: the newest turns that fit, the newest always. Defaults to 8000. */
    historyBudgetChars?: number;
}
