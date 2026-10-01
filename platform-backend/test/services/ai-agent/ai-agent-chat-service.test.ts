/**
 * The chat route's door to the agent: one run at a time, refused up front,
 * and the person's approval answers routed to the waiting call. The
 * orchestrator and the approval gate are real; the model and the tools are
 * fakes.
 */

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';

import { AiAgentBusyError } from '../../../src/services/ai-agent/ai-agent-busy-error.ts';
import { AiAgentChatService } from '../../../src/services/ai-agent/ai-agent-chat-service.ts';
import type { AgentEvent, AgentRunRequest, AgentRunResult } from '../../../src/services/ai-agent/interfaces.ts';
import { ToolCallApprovalGate } from '../../../src/services/ai-agent/tool-call-approval-gate.ts';
import { ToolCallApprovalNotPendingError } from '../../../src/services/ai-agent/tool-call-approval-not-pending-error.ts';
import { ToolCallingChatOrchestrator } from '../../../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import { LlmUnavailableError } from '../../../src/services/llm/llm-unavailable-error.ts';
import { ManualLlmClient } from '../llm/fakes/manual-llm-client.ts';
import { createRecordingToolProviderWithTestCatalog } from './fakes/recording-tool-provider-with-test-catalog.ts';

const QUESTION: AgentRunRequest = { turns: [{ role: 'user', text: 'delete x' }], autoApproveToolCalls: false };

function ignoreEvents(_event: AgentEvent): void {}

test('a second run while one is in progress is refused synchronously, and allowed once the first has finished', async () => {
    const llm: ManualLlmClient = new ManualLlmClient();
    const service: AiAgentChatService = createService(llm);
    llm.queueTextReply('First.');
    llm.queueTextReply('Second.');

    const first: Promise<AgentRunResult> = service.startRun(QUESTION, ignoreEvents, new AbortController().signal);
    assert.throws(() => service.startRun(QUESTION, ignoreEvents, new AbortController().signal), new AiAgentBusyError());
    assert.equal((await first).finalText, 'First.');

    const second: AgentRunResult = await service.startRun(QUESTION, ignoreEvents, new AbortController().signal);
    assert.equal(second.finalText, 'Second.');
});

test('the slot is freed when the run fails on the model server', async () => {
    const llm: ManualLlmClient = new ManualLlmClient();
    const service: AiAgentChatService = createService(llm);
    llm.failWith(new LlmUnavailableError('http://model', 'connection refused', undefined));
    llm.queueTextReply('Back.');

    await assert.rejects(service.startRun(QUESTION, ignoreEvents, new AbortController().signal), LlmUnavailableError);

    const next: AgentRunResult = await service.startRun(QUESTION, ignoreEvents, new AbortController().signal);
    assert.equal(next.finalText, 'Back.');
});

test('an approval answer reaches the call the run is waiting on', async () => {
    const llm: ManualLlmClient = new ManualLlmClient();
    const service: AiAgentChatService = createService(llm);
    llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    llm.queueTextReply('Deleted x.');
    const events: AgentEvent[] = [];
    const answerWhenAsked = (event: AgentEvent): void => {
        events.push(event);
        if (event.type === 'tool_call' && event.needsApproval) {
            void setImmediate().then((): void => service.answerApproval(event.callId, 'approved'));
        }
    };

    const result: AgentRunResult = await service.startRun(QUESTION, answerWhenAsked, new AbortController().signal);

    assert.deepEqual(events[1], { type: 'tool_approval', callId: 1, name: 'delete_thing', decision: 'approved' });
    assert.deepEqual(result.toolCalls.map((call) => call.approval), ['approved']);
});

test('an answer when no run is in progress is refused', () => {
    const service: AiAgentChatService = createService(new ManualLlmClient());

    assert.throws(() => service.answerApproval(1, 'approved'), new ToolCallApprovalNotPendingError(1));
});

function createService(llm: ManualLlmClient): AiAgentChatService {
    const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
    const orchestrator: ToolCallingChatOrchestrator = new ToolCallingChatOrchestrator({
        llm: llm,
        tools: createRecordingToolProviderWithTestCatalog(),
        approver: gate,
    });
    return new AiAgentChatService(orchestrator, gate);
}
