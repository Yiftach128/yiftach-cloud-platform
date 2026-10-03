/**
 * Several tool calls in one model turn: read-only calls start together,
 * anything else runs one at a time in the order asked, results go back to
 * the model in call order whatever order they finished, and call ids number
 * the run's calls across turns. The model, the tools and the approver are
 * fakes.
 */

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';

import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

test('read-only calls of one turn start together, before any of them has answered', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([
        { name: 'list_things', arguments: {} },
        { name: 'count_things', arguments: {} },
    ]);
    harness.llm.queueTextReply('Two things.');

    await harness.ask('list and count');

    assert.deepEqual(harness.events.slice(0, 4).map((event) => event.type), ['tool_call', 'tool_call', 'tool_result', 'tool_result']);
});

test('a turn with a call that writes runs its calls one at a time, in the order asked', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([
        { name: 'list_things', arguments: {} },
        { name: 'add_thing', arguments: { name: 'gamma' } },
        { name: 'count_things', arguments: {} },
    ]);
    harness.llm.queueTextReply('Done.');

    await harness.ask('list, add, count');

    assert.deepEqual(harness.tools.calls.map((call) => call.name), ['list_things', 'add_thing', 'count_things']);
    assert.deepEqual(
        harness.events.slice(0, 6).map((event) => event.type),
        ['tool_call', 'tool_result', 'tool_call', 'tool_result', 'tool_call', 'tool_result'],
    );
});

test('results go back to the model in the order the calls were asked, whatever order they finished', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    let releaseList: (outcome: ToolCallOutcome) => void = (): void => {};
    harness.tools.answerWith('list_things', new Promise<ToolCallOutcome>((resolve) => {
        releaseList = resolve;
    }));
    harness.llm.queueToolCallReply([
        { id: 'c1', name: 'list_things', arguments: {} },
        { id: 'c2', name: 'count_things', arguments: {} },
    ]);
    harness.llm.queueTextReply('Two things.');

    const run = harness.ask('list and count');
    await setImmediate();
    assert.deepEqual(harness.eventsOfType('tool_result').map((event) => event.callId), [2]);
    releaseList({ text: 'things: alpha, beta', isError: false });
    await run;

    assert.deepEqual(harness.eventsOfType('tool_result').map((event) => event.callId), [2, 1]);
    assert.deepEqual(harness.modelRequest(2).messages.slice(3), [
        { role: 'tool', toolName: 'list_things', toolCallId: 'c1', content: 'things: alpha, beta' },
        { role: 'tool', toolName: 'count_things', toolCallId: 'c2', content: '2' },
    ]);
});

test('call ids number the calls of the whole run, across turns', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }, { name: 'count_things', arguments: {} }]);
    harness.llm.queueToolCallReply([{ name: 'add_thing', arguments: { name: 'gamma' } }]);
    harness.llm.queueTextReply('Done.');

    await harness.ask('list, count, then add');

    assert.deepEqual(harness.eventsOfType('tool_call').map((event) => [event.callId, event.name]), [
        [1, 'list_things'],
        [2, 'count_things'],
        [3, 'add_thing'],
    ]);
});
