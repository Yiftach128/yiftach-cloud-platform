/**
 * What an abort (Stop, the tab closing) does at each point of a run: while the
 * model streams, while a call waits for approval, and while a tool runs. The
 * run always resolves, as aborted, and nothing runs afterwards. The model, the
 * tools and the approver are fakes.
 */

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';

import type { AgentEvent, ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

test('an abort while the model streams resolves with the partial text and no further model call', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueTextReply('The beginning of an');
    harness.onEvent = (event: AgentEvent): void => {
        if (event.type === 'delta') {
            harness.abortController.abort();
        }
    };

    const result = await harness.ask('tell me everything');

    assert.equal(result.stopReason, 'aborted');
    assert.equal(result.finalText, 'The beginning of an');
    assert.equal(result.modelCalls, 1);
    assert.equal(harness.llm.requests.length, 1);
});

test('an abort while a call waits for approval runs nothing and reports no decision', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    harness.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    harness.onEvent = (event: AgentEvent): void => {
        if (event.type === 'tool_call' && event.needsApproval) {
            void setImmediate().then((): void => harness.abortController.abort());
        }
    };

    const result = await harness.ask('delete x');

    assert.equal(harness.approver.asks.length, 1);
    assert.deepEqual(harness.tools.calls, []);
    assert.deepEqual(harness.eventsOfType('tool_approval'), []);
    assert.deepEqual(harness.eventsOfType('tool_result'), [{
        type: 'tool_result',
        callId: 1,
        name: 'delete_thing',
        isError: true,
        text: 'Not run: the conversation was stopped before the call was decided.',
    }]);
    assert.equal(result.stopReason, 'aborted');
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['denied']);
    assert.equal(harness.llm.requests.length, 1);
});

test('an abort while a tool runs ends the run before the next model call', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes();
    let releaseList: (outcome: ToolCallOutcome) => void = (): void => {};
    harness.tools.answerWith('list_things', new Promise<ToolCallOutcome>((resolve) => {
        releaseList = resolve;
    }));
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }]);

    const run = harness.ask('list');
    await setImmediate();
    harness.abortController.abort();
    releaseList({ text: 'things: alpha, beta', isError: false });
    const result = await run;

    assert.equal(result.stopReason, 'aborted');
    assert.equal(result.modelCalls, 1);
    assert.deepEqual(result.toolCalls.map((call) => call.name), ['list_things']);
    assert.equal(harness.llm.requests.length, 1);
});
