/**
 * Which calls wait for the person and what a decision does: only a destructive
 * call is asked, a denied one does not run and is refused without a second
 * ask, auto-approve runs it at once, and a writer that only adds never waits.
 * The model, the tools and the approver are fakes.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

test('a destructive call waits for the approver and runs once approved', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.approver.queueDecision('approved');
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.llm.queueTextReply('Deleted x.');

    const result = await harness.ask('delete x');

    assert.deepEqual(harness.approver.asks, [{ callId: 1, name: 'delete_thing', arguments: { id: 'x' }, destructive: true }]);
    assert.deepEqual(harness.tools.calls, [{ name: 'delete_thing', arguments: { id: 'x' } }]);
    assert.deepEqual(harness.events.slice(0, 3), [
        { type: 'tool_call', callId: 1, name: 'delete_thing', arguments: { id: 'x' }, needsApproval: true, destructive: true },
        { type: 'tool_approval', callId: 1, name: 'delete_thing', decision: 'approved' },
        { type: 'tool_result', callId: 1, name: 'delete_thing', isError: false, text: 'deleted' },
    ]);
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['approved']);
});

test('a denied call does not run, and the model is told what was not done', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.approver.queueDecision('denied');
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.llm.queueTextReply('I did not delete x.');

    const result = await harness.ask('delete x');

    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(harness.events.slice(1, 3), [
        { type: 'tool_approval', callId: 1, name: 'delete_thing', decision: 'denied' },
        {
            type: 'tool_result',
            callId: 1,
            name: 'delete_thing',
            isError: true,
            text: 'The user denied this call, so delete_thing was not run. Do not ask for it again: '
                + 'tell the user what was not done and ask how they want to proceed.',
        },
    ]);
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['denied']);
});

test('a call denied once is refused when asked for again, without asking the person twice', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.approver.queueDecision('denied');
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.llm.queueTextReply('Still not deleted.');

    await harness.ask('delete x');

    assert.equal(harness.approver.asks.length, 1);
    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(harness.eventsOfType('tool_approval').length, 1);
    assert.deepEqual(harness.eventsOfType('tool_call')[1], {
        type: 'tool_call',
        callId: 2,
        name: 'delete_thing',
        arguments: { id: 'x' },
        needsApproval: false,
        destructive: true,
    });
    assert.deepEqual(harness.eventsOfType('tool_result')[1], {
        type: 'tool_result',
        callId: 2,
        name: 'delete_thing',
        isError: true,
        text: 'The user already denied delete_thing with exactly these arguments in this conversation. '
            + 'Do not ask for it again; tell the user what was not done.',
    });
});

test('with auto-approve on, a destructive call runs at once, still flagged destructive and recorded as auto-approved', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.autoApproveToolCalls = true;
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.llm.queueTextReply('Deleted x.');

    const result = await harness.ask('delete x');

    assert.deepEqual(harness.approver.asks, []);
    assert.deepEqual(harness.tools.calls, [{ name: 'delete_thing', arguments: { id: 'x' } }]);
    assert.deepEqual(harness.events.slice(0, 2), [
        { type: 'tool_call', callId: 1, name: 'delete_thing', arguments: { id: 'x' }, needsApproval: false, destructive: true },
        { type: 'tool_result', callId: 1, name: 'delete_thing', isError: false, text: 'deleted' },
    ]);
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['auto_approved']);
});

test('a writer that only adds runs without asking', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ name: 'add_thing', arguments: { name: 'gamma' } }]);
    harness.llm.queueTextReply('Added gamma.');

    const result = await harness.ask('add gamma');

    assert.deepEqual(harness.approver.asks, []);
    assert.deepEqual(harness.tools.calls, [{ name: 'add_thing', arguments: { name: 'gamma' } }]);
    assert.deepEqual(harness.eventsOfType('tool_call'), [
        { type: 'tool_call', callId: 1, name: 'add_thing', arguments: { name: 'gamma' }, needsApproval: false, destructive: false },
    ]);
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['not_needed']);
});
