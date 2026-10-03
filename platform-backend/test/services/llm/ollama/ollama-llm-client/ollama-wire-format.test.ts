/**
 * What is Ollama's alone in the client: the `/api/chat` request, a thinking
 * model's thought fragments, a failure reported inside a 200 stream, a reply
 * line that is not JSON, a refusal that is not JSON, and `/api/show`. The
 * client is real, over `fetch`; Ollama is a stand-in server on a free port.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { LlmChatRequest, LlmReply } from '../../../../../src/services/llm/interfaces.ts';
import { LlmRequestError } from '../../../../../src/services/llm/llm-request-error.ts';
import { OllamaLlmClient } from '../../../../../src/services/llm/ollama/ollama-llm-client.ts';
import { OllamaLlmClientWithStandInServer } from './ollama-llm-client-with-stand-in-server.ts';

const QUESTION: LlmChatRequest = { messages: [{ role: 'user', content: 'what is running?' }], tools: [] };

test('a chat is a POST to /api/chat carrying the mapped body; a trailing slash on the base URL is dropped', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    const client: OllamaLlmClient = new OllamaLlmClient({
        baseUrl: `${harness.server.baseUrl}/`,
        model: harness.model,
        contextTokens: harness.contextTokens,
    });
    harness.server.respondWithJsonLines([{ done: true }]);

    await client.streamChat(QUESTION, ignoreDeltas, new AbortController().signal);

    assert.deepEqual(harness.server.requests, [{
        method: 'POST',
        path: '/api/chat',
        body: {
            model: 'test-model',
            stream: true,
            messages: [{ role: 'user', content: 'what is running?' }],
            options: { temperature: 0, num_ctx: 8192 },
        },
    }]);
});

test('a thinking fragment is kept on the reply, whole, and never passed as a delta', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWithJsonLines([
        { message: { role: 'assistant', content: '', thinking: 'The user asks ' } },
        { message: { role: 'assistant', content: '', thinking: 'what runs.' } },
        { message: { role: 'assistant', content: 'Two containers.' } },
        { done: true },
    ]);

    const reply: LlmReply = await harness.chat(QUESTION, new AbortController().signal);

    assert.deepEqual(harness.deltas, ['Two containers.']);
    assert.equal(reply.thinking, 'The user asks what runs.');
    assert.equal(reply.content, 'Two containers.');
});

test('an error line inside a 200 stream is a request error with status 0', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWithJsonLines([
        { message: { role: 'assistant', content: 'Let me ' } },
        { error: 'model requires more system memory (6.1 GiB) than is available (4.2 GiB)' },
    ]);

    await assert.rejects(harness.chat(QUESTION, new AbortController().signal), (error: unknown): boolean => {
        assert.ok(error instanceof LlmRequestError);
        assert.equal(error.status, 0);
        assert.equal(
            error.message,
            'The model server failed the request: model requires more system memory (6.1 GiB) than is available (4.2 GiB)',
        );
        return true;
    });
});

test('a reply line that is not JSON is a request error saying so', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWith(200, '<html>Bad Gateway</html>\n');

    await assert.rejects(harness.chat(QUESTION, new AbortController().signal), (error: unknown): boolean => {
        assert.ok(error instanceof LlmRequestError);
        assert.equal(error.status, 0);
        assert.match(error.message, /^The model server failed the request: a reply line was not valid JSON \(/);
        return true;
    });
});

test('a refusal whose body is not JSON is passed on as text', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWith(502, 'Bad Gateway');

    await assert.rejects(
        harness.chat(QUESTION, new AbortController().signal),
        new LlmRequestError(502, 'HTTP 502: Bad Gateway'),
    );
});

test('readModelCapabilities asks /api/show for the model and answers its capability names', async (t: TestContext) => {
    const harness: OllamaLlmClientWithStandInServer = await OllamaLlmClientWithStandInServer.start(t);
    harness.server.respondWith(200, JSON.stringify({ capabilities: ['completion', 'tools', 'thinking'], details: {} }));

    const capabilities: string[] = await harness.client.readModelCapabilities();

    assert.deepEqual(capabilities, ['completion', 'tools', 'thinking']);
    assert.deepEqual(harness.server.requests, [{ method: 'POST', path: '/api/show', body: { model: 'test-model' } }]);
});

function ignoreDeltas(_text: string): void {}
