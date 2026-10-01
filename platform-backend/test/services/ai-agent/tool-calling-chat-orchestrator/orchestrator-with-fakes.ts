import type {
    AgentEvent,
    AgentRunResult,
    ChatTurn,
    ToolCallingChatOrchestratorOptions,
} from '../../../../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../../../../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import type { LlmChatRequest } from '../../../../src/services/llm/interfaces.ts';
import { ManualLlmClient } from '../../llm/fakes/manual-llm-client.ts';
import { ManualToolCallApprover } from '../fakes/manual-tool-call-approver.ts';
import { RecordingToolProvider } from '../fakes/recording-tool-provider.ts';
import { createRecordingToolProviderWithTestCatalog } from '../fakes/recording-tool-provider-with-test-catalog.ts';

/**
 * The orchestrator built as `server.ts` builds it, with the three fakes in the
 * slots of the model, the tool catalog and the approver, and a `run` that
 * keeps every event. One per test: the test queues replies, outcomes and
 * decisions on the fakes, sets the run's mode or signal, runs, and reads the
 * events, the requests the model got and the result. The optional limits are
 * the orchestrator's own (`maxModelCalls`, the budgets); the rest are fixed.
 */
export class OrchestratorWithFakes {
    readonly llm: ManualLlmClient = new ManualLlmClient();
    readonly tools: RecordingToolProvider = createRecordingToolProviderWithTestCatalog();
    readonly approver: ManualToolCallApprover = new ManualToolCallApprover();
    readonly orchestrator: ToolCallingChatOrchestrator;
    /** Every event the run reported, in order. */
    readonly events: AgentEvent[] = [];
    /** The request's auto-approve switch; false unless a test flips it before `run`. */
    autoApproveToolCalls: boolean = false;
    /** The run's signal; a test aborts it to stop the run. */
    readonly abortController: AbortController = new AbortController();
    /** Sees every event as it happens, before it is kept — for a test that must act mid-run. */
    onEvent: ((event: AgentEvent) => void) | undefined = undefined;

    constructor(limits: Partial<ToolCallingChatOrchestratorOptions> = {}) {
        const options: ToolCallingChatOrchestratorOptions = {
            llm: this.llm,
            tools: this.tools,
            approver: this.approver,
        };
        if (limits.maxModelCalls !== undefined) {
            options.maxModelCalls = limits.maxModelCalls;
        }
        if (limits.maxToolCallsPerTurn !== undefined) {
            options.maxToolCallsPerTurn = limits.maxToolCallsPerTurn;
        }
        if (limits.toolResultBudgetChars !== undefined) {
            options.toolResultBudgetChars = limits.toolResultBudgetChars;
        }
        if (limits.historyBudgetChars !== undefined) {
            options.historyBudgetChars = limits.historyBudgetChars;
        }
        this.orchestrator = new ToolCallingChatOrchestrator(options);
    }

    run(turns: ChatTurn[]): Promise<AgentRunResult> {
        return this.orchestrator.run(
            { turns: turns, autoApproveToolCalls: this.autoApproveToolCalls },
            (event: AgentEvent): void => {
                this.events.push(event);
                if (this.onEvent !== undefined) {
                    this.onEvent(event);
                }
            },
            this.abortController.signal,
        );
    }

    /** Asks one question; the common case. */
    ask(question: string): Promise<AgentRunResult> {
        return this.run([{ role: 'user', text: question }]);
    }

    /** The request of model call `callNumber`, counted from 1; fails when the model was not called that often. */
    modelRequest(callNumber: number): LlmChatRequest {
        const request: LlmChatRequest | undefined = this.llm.requests[callNumber - 1];
        if (request === undefined) {
            throw new Error(`the model was called ${this.llm.requests.length} time(s), not ${callNumber}`);
        }
        return request;
    }

    /** The kept events of one type, in order. */
    eventsOfType<T extends AgentEvent['type']>(type: T): Extract<AgentEvent, { type: T }>[] {
        const matching: Extract<AgentEvent, { type: T }>[] = [];
        for (const event of this.events) {
            if (event.type === type) {
                matching.push(event as Extract<AgentEvent, { type: T }>);
            }
        }
        return matching;
    }
}
