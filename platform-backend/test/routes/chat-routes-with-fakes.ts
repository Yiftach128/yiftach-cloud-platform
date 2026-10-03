import type { TestContext } from 'node:test';

import { postChatApprovalRoute } from '../../src/routes/post-chat-approval.ts';
import { postChatRoute } from '../../src/routes/post-chat.ts';
import { AiAgentChatService } from '../../src/services/ai-agent/ai-agent-chat-service.ts';
import type { ToolCallDecision } from '../../src/services/ai-agent/interfaces.ts';
import { ToolCallApprovalGate } from '../../src/services/ai-agent/tool-call-approval-gate.ts';
import { ToolCallingChatOrchestrator } from '../../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import type { RecordingToolProvider } from '../services/ai-agent/fakes/recording-tool-provider.ts';
import { createRecordingToolProviderWithTestCatalog } from '../services/ai-agent/fakes/recording-tool-provider-with-test-catalog.ts';
import { ManualLlmClient } from '../services/llm/fakes/manual-llm-client.ts';
import { HttpAppUnderTest } from './http-app-under-test.ts';

/**
 * The two chat routes over the assistant as `server.ts` builds it — the real
 * `AiAgentChatService`, orchestrator and approval gate — with the model and
 * the tools faked: `ManualLlmClient` answers what the test queued, and the
 * test-catalog `RecordingToolProvider` stands where the MCP link would be.
 */
export class ChatRoutesWithFakes {
    readonly llm: ManualLlmClient;
    readonly tools: RecordingToolProvider;
    readonly app: HttpAppUnderTest;

    private constructor(llm: ManualLlmClient, tools: RecordingToolProvider, app: HttpAppUnderTest) {
        this.llm = llm;
        this.tools = tools;
        this.app = app;
    }

    static async start(t: TestContext): Promise<ChatRoutesWithFakes> {
        const llm: ManualLlmClient = new ManualLlmClient();
        const tools: RecordingToolProvider = createRecordingToolProviderWithTestCatalog();
        const gate: ToolCallApprovalGate = new ToolCallApprovalGate();
        const chat: AiAgentChatService = new AiAgentChatService(
            new ToolCallingChatOrchestrator({ llm: llm, tools: tools, approver: gate }),
            gate,
        );
        const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [postChatRoute(chat), postChatApprovalRoute(chat)]);
        return new ChatRoutesWithFakes(llm, tools, app);
    }

    /** POST /chat with the body as given; the response resolves once the stream's headers (or a refusal) arrive. */
    postChat(body: unknown, signal?: AbortSignal): Promise<Response> {
        return this.app.request('POST', '/chat', body, signal);
    }

    /** POST /chat/approvals. */
    answerApproval(callId: number, decision: ToolCallDecision): Promise<Response> {
        return this.app.request('POST', '/chat/approvals', { callId: callId, decision: decision });
    }
}

/** A one-question conversation body, as the frontend sends it. */
export function questionBody(text: string): { turns: { role: 'user'; text: string }[] } {
    return { turns: [{ role: 'user', text: text }] };
}
