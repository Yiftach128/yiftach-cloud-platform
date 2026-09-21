/**
 * Public types for talking to a language model — provider-agnostic on purpose.
 *
 * Nothing here knows which model server answers (Ollama today): each provider
 * lives in its own subfolder (`./ollama/`) and keeps its wire format there, so
 * a second provider is one new sibling folder and nothing above this seam
 * changes.
 */

/** One tool call as the model wrote it — the name and arguments are not yet checked against anything. */
export interface LlmToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

/** The instructions that frame the whole conversation. */
export interface LlmSystemMessage {
    role: 'system';
    content: string;
}

export interface LlmUserMessage {
    role: 'user';
    content: string;
}

/** A model turn: text, tool calls, or both. */
export interface LlmAssistantMessage {
    role: 'assistant';
    content: string;
    toolCalls: LlmToolCall[];
}

/** One tool's result, handed back to the model after an assistant turn that called it. */
export interface LlmToolResultMessage {
    role: 'tool';
    toolName: string;
    content: string;
}

export type LlmMessage = LlmSystemMessage | LlmUserMessage | LlmAssistantMessage | LlmToolResultMessage;

/** A tool the model may call in this exchange. */
export interface LlmToolDefinition {
    name: string;
    description: string;
    /** JSON Schema of the arguments object. */
    inputSchema: Record<string, unknown>;
}

export interface LlmChatRequest {
    messages: LlmMessage[];
    /** Empty means the model can only answer in text. */
    tools: LlmToolDefinition[];
}

/** The complete model turn, available once the stream has ended. */
export interface LlmReply {
    /** Every text delta, concatenated. */
    content: string;
    toolCalls: LlmToolCall[];
    /** Tokens the prompt occupied — how full the context window was for this call. */
    promptTokens: number;
    generatedTokens: number;
}

export interface LlmClient {
    /**
     * Sends one chat request and streams the model's turn: `onDelta` receives
     * each text fragment as it is generated, and the promise resolves with the
     * complete turn. The two outputs serve different readers — deltas are for
     * showing progress live; whoever decides what happens next (run a tool or
     * finish) reads the resolved reply.
     *
     * Aborting `signal` ends generation early and the promise still resolves,
     * with whatever had arrived — callers tell the two apart by
     * `signal.aborted`. Rejects with `LlmUnavailableError` when the model
     * server cannot be reached or goes silent, and with `LlmRequestError` when
     * it answers with a failure.
     */
    streamChat(request: LlmChatRequest, onDelta: (textDelta: string) => void, signal: AbortSignal): Promise<LlmReply>;
}
