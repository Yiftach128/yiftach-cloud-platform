/**
 * The calls the loop refuses or fails in band, as results the model reads
 * instead of exceptions: an unknown tool, an exact repeat, a tool that throws,
 * and the calls past the per-turn cap. The model, the tools and the approver
 * are fakes.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

test('an unknown tool is refused with the list of available tools, and nothing runs', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ name: 'explode', arguments: {} }]);
    harness.llm.queueTextReply('Sorry.');

    const result = await harness.ask('explode');

    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(harness.eventsOfType('tool_result'), [{
        type: 'tool_result',
        callId: 1,
        name: 'explode',
        isError: true,
        text: 'Unknown tool "explode". The available tools are: list_things, count_things, add_thing, delete_thing.',
    }]);
    assert.equal(result.stopReason, 'answered');
    assert.equal(result.toolCalls.length, 1);
});

test('a call repeated with exactly the same arguments is refused, one with other arguments runs', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: { kind: 'a' } }]);
    harness.llm.queueToolCallReply([
        { name: 'list_things', arguments: { kind: 'a' } },
        { name: 'list_things', arguments: { kind: 'b' } },
    ]);
    harness.llm.queueTextReply('Done.');

    await harness.ask('list a, then a and b');

    assert.deepEqual(harness.tools.calls, [
        { name: 'list_things', arguments: { kind: 'a' } },
        { name: 'list_things', arguments: { kind: 'b' } },
    ]);
    const results = harness.eventsOfType('tool_result');
    assert.equal(results.length, 3);
    assert.deepEqual(results[1], {
        type: 'tool_result',
        callId: 2,
        name: 'list_things',
        isError: true,
        text: 'You already called list_things with exactly these arguments in this conversation. '
            + 'Use that result and answer the user instead of calling it again.',
    });
});

test('a tool that throws becomes an error result and the run goes on', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.tools.failWith('count_things', new Error('boom'));
    harness.llm.queueToolCallReply([{ name: 'count_things', arguments: {} }]);
    harness.llm.queueTextReply('The count failed.');

    const result = await harness.ask('how many?');

    assert.deepEqual(harness.eventsOfType('tool_result'), [{
        type: 'tool_result',
        callId: 1,
        name: 'count_things',
        isError: true,
        text: 'The tool failed unexpectedly: boom',
    }]);
    assert.equal(result.stopReason, 'answered');
    assert.equal(result.finalText, 'The count failed.');
});

test('calls past the per-turn cap are refused in band, numbered and answered like the rest', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ maxToolCallsPerTurn: 2 });
    harness.llm.queueToolCallReply([
        { id: 'c1', name: 'count_things', arguments: {} },
        { id: 'c2', name: 'list_things', arguments: {} },
        { id: 'c3', name: 'add_thing', arguments: { name: 'gamma' } },
    ]);
    harness.llm.queueTextReply('Two of three.');

    const result = await harness.ask('count, list, add');

    assert.deepEqual(harness.tools.calls, [
        { name: 'count_things', arguments: {} },
        { name: 'list_things', arguments: {} },
    ]);
    const refusalText: string =
        'Not run: at most 2 tool calls are allowed per turn. Ask again in your next turn if you still need it.';
    assert.deepEqual(harness.eventsOfType('tool_call').map((event) => event.callId), [1, 2, 3]);
    assert.deepEqual(harness.eventsOfType('tool_result')[2], {
        type: 'tool_result',
        callId: 3,
        name: 'add_thing',
        isError: true,
        text: refusalText,
    });
    assert.deepEqual(harness.modelRequest(2).messages[5], {
        role: 'tool',
        toolName: 'add_thing',
        toolCallId: 'c3',
        content: refusalText,
    });
    assert.deepEqual(result.toolCalls[2], {
        name: 'add_thing',
        arguments: { name: 'gamma' },
        llmToolCallId: 'c3',
        isError: true,
        resultText: refusalText,
        approval: 'not_needed',
    });
});
