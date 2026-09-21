/**
 * Maps between the provider-agnostic chat types and Ollama's `/api/chat` wire
 * format. Ollama's shapes are declared here and go no further than this folder
 * (the quarantine convention `services/docker/` uses for dockerode).
 */

import type { LlmChatRequest, LlmMessage, LlmToolCall, LlmToolDefinition } from '../interfaces.ts';

/**
 * Sampling temperature. Zero on purpose: this assistant picks tools and reports
 * facts, so the same question should take the same path every time — which is
 * also what makes tool-choice checks reproducible.
 */
const TEMPERATURE = 0;

interface OllamaToolCall {
    function: {
        name: string;
        arguments: Record<string, unknown>;
    };
}

interface OllamaMessage {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
    /** On `role: "tool"` messages: which tool produced `content`. */
    tool_name?: string;
}

interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface OllamaChatRequestBody {
    model: string;
    stream: boolean;
    messages: OllamaMessage[];
    tools?: OllamaTool[];
    options: {
        temperature: number;
        num_ctx: number;
    };
}

/** One line of the streamed reply. Every field is optional: text lines, the closing line and error lines differ. */
export interface OllamaChatChunk {
    message?: {
        content?: unknown;
        tool_calls?: unknown;
    };
    done?: boolean;
    /** Failure reported inside a 200 stream. */
    error?: unknown;
    /** On the closing line: tokens the prompt occupied. */
    prompt_eval_count?: unknown;
    /** On the closing line: tokens generated. */
    eval_count?: unknown;
}

export function toOllamaChatRequestBody(
    request: LlmChatRequest,
    model: string,
    contextTokens: number,
): OllamaChatRequestBody {
    const body: OllamaChatRequestBody = {
        model: model,
        stream: true,
        messages: request.messages.map(toOllamaMessage),
        options: {
            temperature: TEMPERATURE,
            num_ctx: contextTokens,
        },
    };
    // Left out rather than sent empty: an absent list is the documented way to offer no tools.
    if (request.tools.length > 0) {
        body.tools = request.tools.map(toOllamaTool);
    }
    return body;
}

function toOllamaMessage(message: LlmMessage): OllamaMessage {
    if (message.role === 'assistant') {
        const assistantMessage: OllamaMessage = { role: 'assistant', content: message.content };
        if (message.toolCalls.length > 0) {
            assistantMessage.tool_calls = message.toolCalls.map(toOllamaToolCall);
        }
        return assistantMessage;
    }
    if (message.role === 'tool') {
        return { role: 'tool', content: message.content, tool_name: message.toolName };
    }
    return { role: message.role, content: message.content };
}

function toOllamaToolCall(call: LlmToolCall): OllamaToolCall {
    return { function: { name: call.name, arguments: call.arguments } };
}

function toOllamaTool(tool: LlmToolDefinition): OllamaTool {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    };
}

/** A parsed stream line is `unknown`; anything that is not a JSON object carries nothing and reads as an empty chunk. */
export function toOllamaChatChunk(value: unknown): OllamaChatChunk {
    if (typeof value !== 'object' || value === null) {
        return {};
    }
    return value as OllamaChatChunk;
}

/**
 * Reads the tool calls of one chunk. Ollama delivers each call whole (never as
 * partial JSON), so a chunk's calls can simply be appended to the reply's.
 * Entries without a usable name are dropped; arguments that are not an object
 * become `{}`, which the tool's own validation then reports back to the model.
 */
export function toLlmToolCalls(rawToolCalls: unknown): LlmToolCall[] {
    if (!Array.isArray(rawToolCalls)) {
        return [];
    }
    const calls: LlmToolCall[] = [];
    for (const rawCall of rawToolCalls) {
        if (typeof rawCall !== 'object' || rawCall === null) {
            continue;
        }
        const rawFunction: unknown = (rawCall as { function?: unknown }).function;
        if (typeof rawFunction !== 'object' || rawFunction === null) {
            continue;
        }
        const name: unknown = (rawFunction as { name?: unknown }).name;
        if (typeof name !== 'string' || name === '') {
            continue;
        }
        const rawArguments: unknown = (rawFunction as { arguments?: unknown }).arguments;
        let callArguments: Record<string, unknown>;
        if (typeof rawArguments === 'object' && rawArguments !== null && !Array.isArray(rawArguments)) {
            callArguments = rawArguments as Record<string, unknown>;
        } else {
            callArguments = {};
        }
        calls.push({ name: name, arguments: callArguments });
    }
    return calls;
}
