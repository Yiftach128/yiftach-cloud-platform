/**
 * The chat's approver: it parks one call until the person's answer arrives by
 * call id, or the run's signal aborts it. Nothing faked; the test plays both
 * the loop asking and the route answering.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ToolCallApprovalRequest, ToolCallDecision } from '../../../src/services/ai-agent/interfaces.ts';
import { ToolCallApprovalGate } from '../../../src/services/ai-agent/tool-call-approval-gate.ts';
import { ToolCallApprovalNotPendingError } from '../../../src/services/ai-agent/tool-call-approval-not-pending-error.ts';

function askFor(callId: number): ToolCallApprovalRequest {
    return { callId: callId, name: 'delete_thing', arguments: { id: 'x' }, destructive: true };
}

test('the answer for the waiting call resolves it with the decision', async () => {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const waiting: Promise<ToolCallDecision> = gate.requestApproval(askFor(1), new AbortController().signal);

    gate.answer(1, 'approved');

    assert.equal(await waiting, 'approved');
});

test('an answer for a call that is not waiting is refused, naming the call', async () => {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const waiting: Promise<ToolCallDecision> = gate.requestApproval(askFor(1), new AbortController().signal);

    assert.throws(() => gate.answer(2, 'approved'), new ToolCallApprovalNotPendingError(2));
    gate.answer(1, 'denied');
    assert.equal(await waiting, 'denied');
    assert.throws(() => gate.answer(1, 'denied'), new ToolCallApprovalNotPendingError(1));
});

test('an abort resolves the waiting call as denied and clears it', async () => {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const controller: AbortController = new AbortController();
    const waiting: Promise<ToolCallDecision> = gate.requestApproval(askFor(1), controller.signal);

    controller.abort();

    assert.equal(await waiting, 'denied');
    assert.throws(() => gate.answer(1, 'approved'), new ToolCallApprovalNotPendingError(1));
});

test('a call asked on a signal already aborted is denied at once', async () => {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const controller: AbortController = new AbortController();
    controller.abort();

    assert.equal(await gate.requestApproval(askFor(1), controller.signal), 'denied');
});

test('a second ask while one call waits is a programming error, not a queue', async () => {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const signal: AbortSignal = new AbortController().signal;
    const waiting: Promise<ToolCallDecision> = gate.requestApproval(askFor(1), signal);

    await assert.rejects(gate.requestApproval(askFor(2), signal), /#2 asked for approval while #1 was still waiting/);
    gate.answer(1, 'approved');
    assert.equal(await waiting, 'approved');
});
