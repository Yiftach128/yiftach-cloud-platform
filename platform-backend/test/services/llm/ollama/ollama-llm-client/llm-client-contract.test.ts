/**
 * The `LlmClient` contract, as the Ollama client keeps it: fragments are
 * streamed and the resolved reply is the whole turn; an abort resolves with
 * what had arrived; an unreachable or silent server is `LlmUnavailableError`;
 * a refusal is `LlmRequestError`. The client is real, over `fetch`; Ollama is
 * a stand-in server on a free port; the idle watchdog runs on the runner's
 * timers.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { LlmChatRequest, LlmReply } from '../../../../../src/services/llm/interfaces.ts';
import { LlmRequestError } from '../../../../../src/services/llm/llm-request-error.ts';
import { LlmUnavailableError } from '../../../../../src/services/llm/llm-unavailable-error.ts';
import { OllamaLlmClient } from '../../../../../src/services/llm/ollama/ollama-llm-client.ts';
import { StandInOllamaServer } from '../stand-in-ollama-server.ts';
import { OllamaLlmClientWithStandInServer } from './ollama-llm-client-with-stand-in-server.ts';

const QUESTION: LlmChatRequest = { messages: [{ role: 'user', content: 'what is running?' }], tools: [] };

test('text fragments reach onDelta one by one, and the reply is the whole turn with its tool calls and token counts', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWithJsonLines([
        { message: { role: 'assistant', content: 'Let me ' } },
        { message: { role: 'assistant', content: 'check.' } },
        { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_containers', arguments: { state: 'running' } } }] } },
        { done: true, prompt_eval_count: 1200, eval_count: 15 },
    ]);

    const reply: LlmReply = await harness.chat(QUESTION, new AbortController().signal);

    assert.deepEqual(harness.deltas, ['Let me ', 'check.']);
    assert.deepEqual(reply, {
        content: 'Let me check.',
        toolCalls: [{ name: 'list_containers', arguments: { state: 'running' } }],
        promptTokens: 1200,
        generatedTokens: 15,
    });
});

test('an abort mid-stream resolves with the text so far, not an error', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWithJsonLinesAndHoldOpen([{ message: { role: 'assistant', content: 'Let me ' } }]);
    const stop: AbortController = new AbortController();
    const abortOnFirstFragment = (text: string): void => {
        harness.deltas.push(text);
        stop.abort();
    };

    const reply: LlmReply = await harness.client.streamChat(QUESTION, abortOnFirstFragment, stop.signal);

    assert.deepEqual(harness.deltas, ['Let me ']);
    assert.equal(reply.content, 'Let me ');
    assert.deepEqual(reply.toolCalls, []);
});

test('nothing listening at the base URL is an unavailable error carrying the reason, the hint and the cause', async () => {
    const server: StandInOllamaServer = new StandInOllamaServer();
    await server.start();
    await server.stop();
    const client: OllamaLlmClient = new OllamaLlmClient({ baseUrl: server.baseUrl, model: 'test-model', contextTokens: 8192 });

    await assert.rejects(client.streamChat(QUESTION, ignoreDeltas, new AbortController().signal), (error: unknown): boolean => {
        assert.ok(error instanceof LlmUnavailableError);
        assert.ok(error.message.startsWith(`Cannot reach the model server at ${server.baseUrl}: `), error.message);
        assert.match(error.message, /ECONNREFUSED/);
        assert.match(error.message, /Check that Ollama is running where OLLAMA_URL points/);
        assert.ok(error.cause instanceof Error);
        return true;
    });
});

test('a stream silent for 120 seconds is an unavailable error, and the fragments before it are not lost to onDelta', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWithJsonLinesAndHoldOpen([{ message: { role: 'assistant', content: 'Let me ' } }]);
    const fallSilentAfterFirstFragment = (text: string): void => {
        harness.deltas.push(text);
        t.mock.timers.tick(120_000);
    };

    const run: Promise<LlmReply> = harness.client.streamChat(QUESTION, fallSilentAfterFirstFragment, new AbortController().signal);

    await assert.rejects(run, (error: unknown): boolean => {
        assert.ok(error instanceof LlmUnavailableError);
        assert.match(error.message, /no data for 120s/);
        return true;
    });
    assert.deepEqual(harness.deltas, ['Let me ']);
});

test('a refused request is a request error carrying the status and the server\'s message', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWith(404, JSON.stringify({ error: 'model "test-model" not found, try pulling it first' }));

    await assert.rejects(harness.chat(QUESTION, new AbortController().signal), (error: unknown): boolean => {
        assert.ok(error instanceof LlmRequestError);
        assert.equal(error.status, 404);
        assert.equal(
            error.message,
            'The model server failed the request: HTTP 404: model "test-model" not found, try pulling it first',
        );
        return true;
    });
});

function ignoreDeltas(_text: string): void {}
