import { AiAgentBusyError } from './ai-agent-busy-error.ts';
import type { AgentEvent, AgentRunRequest, AgentRunResult, ToolCallDecision } from './interfaces.ts';
import type { ToolCallApprovalGate } from './tool-call-approval-gate.ts';
import { ToolCallApprovalNotPendingError } from './tool-call-approval-not-pending-error.ts';
import type { ToolCallingChatOrchestrator } from './tool-calling-chat-orchestrator.ts';

/**
 * The chat endpoint's door to the agent: runs one conversation at a time, and
 * takes the person's answers to the tool calls that run waits on.
 *
 * The model runs on a single GPU, where a second conversation would only wait
 * inside the model server — silent for so long that its idle watchdog may
 * report the server as unreachable. A second run is therefore refused up front
 * (`AiAgentBusyError`) instead of queued. One run at a time is also what lets
 * an approval answer name its call by `callId` alone.
 */
export class AiAgentChatService {
    private readonly orchestrator: ToolCallingChatOrchestrator;
    private readonly approvalGate: ToolCallApprovalGate;
    private runInProgress: boolean = false;

    constructor(orchestrator: ToolCallingChatOrchestrator, approvalGate: ToolCallApprovalGate) {
        this.orchestrator = orchestrator;
        this.approvalGate = approvalGate;
    }

    /**
     * Starts a run and returns its promise — see `ToolCallingChatOrchestrator.run`
     * for the events, the abort behaviour and the rejections.
     *
     * Deliberately not `async`: `AiAgentBusyError` is thrown synchronously, so a
     * caller that answers with a stream learns about the refusal before it has
     * committed to one. No event is reported before this method returns.
     */
    startRun(
        request: AgentRunRequest,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<AgentRunResult> {
        if (this.runInProgress) {
            throw new AiAgentBusyError();
        }
        this.runInProgress = true;
        return this.runAndRelease(request, onEvent, signal);
    }

    /**
     * The person's answer to the tool call the current run is waiting on.
     * Throws {@link ToolCallApprovalNotPendingError} when no run is in progress
     * or the run waits on no call with that id.
     */
    answerApproval(callId: number, decision: ToolCallDecision): void {
        if (!this.runInProgress) {
            throw new ToolCallApprovalNotPendingError(callId);
        }
        this.approvalGate.answer(callId, decision);
    }

    private async runAndRelease(
        request: AgentRunRequest,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<AgentRunResult> {
        try {
            // Awaited before anything else, so not even a misbehaving orchestrator reports an event synchronously.
            await Promise.resolve();
            return await this.orchestrator.run(request, onEvent, signal);
        } finally {
            this.runInProgress = false;
        }
    }
}
