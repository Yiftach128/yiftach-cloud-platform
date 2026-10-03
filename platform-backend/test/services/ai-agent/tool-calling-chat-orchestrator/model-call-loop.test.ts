/**
 * How the loop calls the model: a text reply ends the run, a tool call is run
 * and its result sent back, the capped last call offers no tools, and the
 * conversation reaches the model through the history window. The model, the
 * tools and the approver are fakes.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LlmMessage } from '../../../../src/services/llm/interfaces.ts';
import { LlmUnavailableError } from '../../../../src/services/llm/llm-unavailable-error.ts';
import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

test('a plain-text reply is the answer and ends the run after one model call', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueTextReply('Hello.');

    const result = await harness.ask('hi');

    assert.equal(result.finalText, 'Hello.');
    assert.equal(result.stopReason, 'answered');
    assert.equal(result.modelCalls, 1);
    assert.deepEqual(result.toolCalls, []);
    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(harness.events, [{ type: 'delta', text: 'Hello.' }]);
});

test('the model is offered every tool of the catalog, after the system prompt and the conversation', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueTextReply('Hello.');

    await harness.ask('hi');

    const request = harness.modelRequest(1);
    assert.deepEqual(request.tools.map((tool) => tool.name), ['list_things', 'count_things', 'add_thing', 'delete_thing']);
    assert.deepEqual(request.messages.map((message: LlmMessage) => message.role), ['system', 'user']);
});

test('a tool call is run and its result goes back to the model, which then answers', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ id: 'c1', name: 'list_things', arguments: {} }], 100);
    harness.llm.queueTextReply('alpha and beta', 250);

    const result = await harness.ask('what is there?');

    assert.deepEqual(harness.tools.calls, [{ name: 'list_things', arguments: {} }]);
    assert.deepEqual(harness.modelRequest(2).messages.slice(2), [
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'list_things', arguments: {} }] },
        { role: 'tool', toolName: 'list_things', toolCallId: 'c1', content: 'things: alpha, beta' },
    ]);
    assert.deepEqual(harness.events, [
        { type: 'tool_call', callId: 1, name: 'list_things', arguments: {}, needsApproval: false, destructive: false },
        { type: 'tool_result', callId: 1, name: 'list_things', isError: false, text: 'things: alpha, beta' },
        { type: 'delta', text: 'alpha and beta' },
    ]);
    assert.deepEqual(result, {
        finalText: 'alpha and beta',
        stopReason: 'answered',
        toolCalls: [{
            name: 'list_things',
            arguments: {},
            llmToolCallId: 'c1',
            isError: false,
            resultText: 'things: alpha, beta',
            approval: 'not_needed',
        }],
        modelCalls: 2,
        peakPromptTokens: 250,
    });
});

test('the last allowed model call offers no tools, says so after the tool results, and ends the run as capped', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ maxModelCalls: 2 });
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }]);
    harness.llm.queueTextReply('I could not finish.');

    const result = await harness.ask('list and count');

    const lastRequest = harness.modelRequest(2);
    assert.deepEqual(lastRequest.tools, []);
    const lastMessage: LlmMessage | undefined = lastRequest.messages[lastRequest.messages.length - 1];
    assert.ok(lastMessage !== undefined);
    assert.equal(lastMessage.role, 'system');
    assert.match(lastMessage.content, /no tools are available now/);
    assert.equal(result.stopReason, 'model_call_limit');
    assert.equal(result.finalText, 'I could not finish.');
    assert.equal(result.modelCalls, 2);
});

test('tool calls the model invents on the capped call are not run', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ maxModelCalls: 1 });
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);

    const result = await harness.ask('delete x');

    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(result.toolCalls, []);
    assert.equal(result.stopReason, 'model_call_limit');
});

test('of a long conversation, only the newest turns within the history budget reach the model', async () => {
    // The newest three turns are 22 characters; the answer before them would make it 36.
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ historyBudgetChars: 25 });
    harness.llm.queueTextReply('Beta.');

    await harness.run([
        { role: 'user', text: 'a first question, long enough to fall out' },
        { role: 'assistant', text: 'a first answer' },
        { role: 'user', text: 'second one' },
        { role: 'assistant', text: 'Alpha.' },
        { role: 'user', text: 'third?' },
    ]);

    assert.deepEqual(harness.modelRequest(1).messages.slice(1), [
        { role: 'user', content: 'second one' },
        { role: 'assistant', content: 'Alpha.', toolCalls: [] },
        { role: 'user', content: 'third?' },
    ]);
});

test('a model-server failure rejects the run', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    const failure: LlmUnavailableError = new LlmUnavailableError('http://model', 'connection refused', undefined);
    harness.llm.failWith(failure);

    await assert.rejects(harness.ask('hi'), failure);
});
