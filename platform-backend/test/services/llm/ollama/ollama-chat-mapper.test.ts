/**
 * The mapping between the provider-agnostic chat types and Ollama's wire
 * format: what every request body carries, how messages, tool calls and tool
 * definitions are written, and how a reply's tool calls and a model's
 * capabilities are read. Pure functions, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LlmChatRequest, LlmToolDefinition } from '../../../../src/services/llm/interfaces.ts';
import {
    toLlmToolCalls,
    toModelCapabilities,
    toOllamaChatRequestBody,
} from '../../../../src/services/llm/ollama/ollama-chat-mapper.ts';
import type { OllamaChatRequestBody } from '../../../../src/services/llm/ollama/ollama-chat-mapper.ts';

const QUESTION: LlmChatRequest = { messages: [{ role: 'user', content: 'hi' }], tools: [] };
const LIST_TOOL: LlmToolDefinition = {
    name: 'list_things',
    description: 'Lists the things.',
    inputSchema: { type: 'object', properties: { state: { type: 'string' } } },
};

test('every request streams, samples at temperature 0 and sets the context size; with no tools and no think setting it carries nothing else', () => {
    const body: OllamaChatRequestBody = toOllamaChatRequestBody(QUESTION, 'qwen3:4b', 8192, undefined);

    assert.deepEqual(body, {
        model: 'qwen3:4b',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0, num_ctx: 8192 },
    });
});

test('tools are offered as function definitions with the input schema as their parameters', () => {
    const body: OllamaChatRequestBody = toOllamaChatRequestBody({ ...QUESTION, tools: [LIST_TOOL] }, 'qwen3:4b', 8192, undefined);

    assert.deepEqual(body.tools, [{
        type: 'function',
        function: {
            name: 'list_things',
            description: 'Lists the things.',
            parameters: { type: 'object', properties: { state: { type: 'string' } } },
        },
    }]);
});

test('"think" is sent as configured, on or off, and left out when not configured', () => {
    assert.equal(toOllamaChatRequestBody(QUESTION, 'qwen3.5:4b', 8192, true).think, true);
    assert.equal(toOllamaChatRequestBody(QUESTION, 'qwen3.5:4b', 8192, false).think, false);
    assert.equal('think' in toOllamaChatRequestBody(QUESTION, 'qwen3.5:4b', 8192, undefined), false);
});

test('an assistant turn with tool calls carries them as function calls; one without carries no tool_calls key', () => {
    const body: OllamaChatRequestBody = toOllamaChatRequestBody({
        messages: [
            { role: 'system', content: 'Be brief.' },
            { role: 'user', content: 'what is there?' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'list_things', arguments: { state: 'running' } }] },
            { role: 'tool', toolName: 'list_things', toolCallId: 'c1', content: '["alpha"]' },
            { role: 'assistant', content: 'Only alpha.', toolCalls: [] },
        ],
        tools: [],
    }, 'qwen3:4b', 8192, undefined);

    assert.deepEqual(body.messages, [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'what is there?' },
        { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_things', arguments: { state: 'running' } } }] },
        { role: 'tool', content: '["alpha"]', tool_name: 'list_things' },
        { role: 'assistant', content: 'Only alpha.' },
    ]);
});

test('tool calls are read whole and without an id; an entry without a name is dropped; arguments that are not an object become empty', () => {
    const calls = toLlmToolCalls([
        { function: { name: 'list_things', arguments: { state: 'running' } } },
        { function: { arguments: { state: 'running' } } },
        { function: { name: 'count_things', arguments: '{"state":"running"}' } },
        'junk',
    ]);

    assert.deepEqual(calls, [
        { name: 'list_things', arguments: { state: 'running' } },
        { name: 'count_things', arguments: {} },
    ]);
    assert.deepEqual(toLlmToolCalls(undefined), []);
});

test('the capabilities are the string entries of /api/show\'s list; any other shape reads as none', () => {
    assert.deepEqual(toModelCapabilities({ capabilities: ['completion', 'tools', 7, 'thinking'] }), ['completion', 'tools', 'thinking']);
    assert.deepEqual(toModelCapabilities({ capabilities: 'tools' }), []);
    assert.deepEqual(toModelCapabilities({ details: {} }), []);
    assert.deepEqual(toModelCapabilities('not an object'), []);
});
