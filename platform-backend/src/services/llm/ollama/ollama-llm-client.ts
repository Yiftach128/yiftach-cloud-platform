/**
 * `LlmClient` over Ollama's `/api/chat`, with plain `fetch` — no client library.
 *
 * The reply is an open stream: Ollama keeps the HTTP response open and writes
 * one JSON line per generated fragment (NDJSON), closing with a line that has
 * `done: true` and the token counts. Tool calls arrive whole inside those
 * lines. Ollama reports failures two ways — a non-2xx status before the stream,
 * or an `{"error": ...}` line inside a 200 stream (the Docker Engine does the
 * same, see `docker/drain-progress-stream.ts`) — and both become
 * `LlmRequestError`.
 */

import type { LlmChatRequest, LlmClient, LlmReply, LlmToolCall } from '../interfaces.ts';
import { LlmRequestError } from '../llm-request-error.ts';
import { LlmUnavailableError } from '../llm-unavailable-error.ts';
import type { OllamaLlmClientOptions } from './interfaces.ts';
import { toLlmToolCalls, toOllamaChatChunk, toOllamaChatRequestBody } from './ollama-chat-mapper.ts';
import type { OllamaChatChunk, OllamaChatRequestBody } from './ollama-chat-mapper.ts';
import { readNdjsonStream } from './read-ndjson-stream.ts';

/**
 * How long the stream may stay silent before the request is given up. Generous
 * because the first request after a pause loads the model into GPU memory, and
 * Ollama sends nothing while it does.
 */
const STREAM_IDLE_TIMEOUT_MS = 120_000;

const UNREACHABLE_HINT =
    'Check that Ollama is running (`ollama ps` inside the WSL distro) and that OLLAMA_URL points at it.';

export class OllamaLlmClient implements LlmClient {
    /** Endpoint this instance talks to. For logging and errors. */
    readonly baseUrl: string;
    readonly model: string;
    private readonly contextTokens: number;

    constructor(options: OllamaLlmClientOptions) {
        if (options.baseUrl.endsWith('/')) {
            this.baseUrl = options.baseUrl.substring(0, options.baseUrl.length - 1);
        } else {
            this.baseUrl = options.baseUrl;
        }
        this.model = options.model;
        this.contextTokens = options.contextTokens;
    }

    async streamChat(
        request: LlmChatRequest,
        onDelta: (textDelta: string) => void,
        signal: AbortSignal,
    ): Promise<LlmReply> {
        const reply: LlmReply = { content: '', toolCalls: [], promptTokens: 0, generatedTokens: 0 };
        const body: OllamaChatRequestBody = toOllamaChatRequestBody(request, this.model, this.contextTokens);

        // The caller's signal is the Stop button; the watchdog's is ours. Either ends the fetch.
        const idleWatchdog: AbortController = new AbortController();
        const eitherSignal: AbortSignal = AbortSignal.any([signal, idleWatchdog.signal]);
        let idleTimer: NodeJS.Timeout | undefined;
        const resetIdleTimer = (): void => {
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(() => idleWatchdog.abort(), STREAM_IDLE_TIMEOUT_MS);
            idleTimer.unref();
        };

        try {
            resetIdleTimer();
            const response: Response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: eitherSignal,
            });
            if (!response.ok) {
                throw new LlmRequestError(response.status, await readErrorDetail(response));
            }
            if (response.body === null) {
                throw new LlmRequestError(response.status, 'the reply had no body');
            }
            await readNdjsonStream(response.body, (value: unknown): void => {
                resetIdleTimer();
                applyChunk(toOllamaChatChunk(value), reply, onDelta);
            });
        } catch (error) {
            if (signal.aborted) {
                // Stop is not an error: the caller gets whatever had arrived.
                return reply;
            }
            if (error instanceof LlmRequestError) {
                throw error;
            }
            if (error instanceof SyntaxError) {
                throw new LlmRequestError(0, `a reply line was not valid JSON (${error.message})`);
            }
            if (idleWatchdog.signal.aborted) {
                const silence: string = `no data for ${STREAM_IDLE_TIMEOUT_MS / 1000}s`;
                throw new LlmUnavailableError(this.baseUrl, `${silence}. ${UNREACHABLE_HINT}`, error);
            }
            throw new LlmUnavailableError(this.baseUrl, `${describeFetchFailure(error)}. ${UNREACHABLE_HINT}`, error);
        } finally {
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
        }
        return reply;
    }
}

/** Folds one stream line into the reply, forwarding its text fragment — the only part worth showing live. */
function applyChunk(chunk: OllamaChatChunk, reply: LlmReply, onDelta: (textDelta: string) => void): void {
    if (chunk.error !== undefined) {
        throw new LlmRequestError(0, String(chunk.error));
    }
    if (chunk.message !== undefined) {
        const text: unknown = chunk.message.content;
        if (typeof text === 'string' && text !== '') {
            reply.content = reply.content + text;
            onDelta(text);
        }
        const calls: LlmToolCall[] = toLlmToolCalls(chunk.message.tool_calls);
        for (const call of calls) {
            reply.toolCalls.push(call);
        }
    }
    if (typeof chunk.prompt_eval_count === 'number') {
        reply.promptTokens = chunk.prompt_eval_count;
    }
    if (typeof chunk.eval_count === 'number') {
        reply.generatedTokens = chunk.eval_count;
    }
}

/** Ollama answers a refused request with `{"error": "..."}`; anything else is passed on as text. */
async function readErrorDetail(response: Response): Promise<string> {
    const text: string = await response.text();
    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
            const message: unknown = (parsed as { error?: unknown }).error;
            if (typeof message === 'string') {
                return `HTTP ${response.status}: ${message}`;
            }
        }
    } catch {
        // Not JSON — fall through to the raw text.
    }
    return `HTTP ${response.status}: ${text}`;
}

/** Node's fetch hides the real reason ("fetch failed") one level down, in `cause`. */
function describeFetchFailure(error: unknown): string {
    if (error instanceof Error) {
        if (error.cause instanceof Error && error.cause.message !== '') {
            return error.cause.message;
        }
        return error.message;
    }
    return String(error);
}
