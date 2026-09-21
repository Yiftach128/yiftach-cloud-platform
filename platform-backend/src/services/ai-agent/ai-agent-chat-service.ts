import { AiAgentBusyError } from './ai-agent-busy-error.ts';
import type { AgentEvent, AgentRunResult, ChatTurn } from './interfaces.ts';
import type { ToolCallingChatOrchestrator } from './tool-calling-chat-orchestrator.ts';

/**
 * The chat endpoint's door to the agent: runs one conversation at a time.
 *
 * The model runs on a single GPU, where a second conversation would only wait
 * inside the model server — silent for so long that its idle watchdog may
 * report the server as unreachable. A second run is therefore refused up front
 * (`AiAgentBusyError`) instead of queued.
 */
export class AiAgentChatService {
    private readonly orchestrator: ToolCallingChatOrchestrator;
    private runInProgress: boolean = false;

    constructor(orchestrator: ToolCallingChatOrchestrator) {
        this.orchestrator = orchestrator;
    }

    /**
     * Starts a run and returns its promise — see `ToolCallingChatOrchestrator.run`
     * for the events, the abort behaviour and the rejections.
     *
     * Deliberately not `async`: `AiAgentBusyError` is thrown synchronously, so a
     * caller that answers with a stream learns about the refusal before it has
     * committed to one. No event is reported before this method returns.
     */
    startRun(turns: ChatTurn[], onEvent: (event: AgentEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
        if (this.runInProgress) {
            throw new AiAgentBusyError();
        }
        this.runInProgress = true;
        return this.runAndRelease(turns, onEvent, signal);
    }

    private async runAndRelease(
        turns: ChatTurn[],
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<AgentRunResult> {
        try {
            // Awaited before anything else, so not even a misbehaving orchestrator reports an event synchronously.
            await Promise.resolve();
            return await this.orchestrator.run(turns, onEvent, signal);
        } finally {
            this.runInProgress = false;
        }
    }
}
