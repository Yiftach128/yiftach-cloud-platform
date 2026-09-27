import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, ProviderOptions, ProviderResponse } from 'promptfoo';
import type { McpToolProvider } from '../../src/mcp/client/mcp-tool-provider.ts';
import { config } from '../../src/config/config.ts';
import type { AgentRunResult, ChatTurn } from '../../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import type { LlmClient } from '../../src/services/llm/interfaces.ts';
import { OllamaLlmClient } from '../../src/services/llm/ollama/ollama-llm-client.ts';
import { AutoApproveToolCallApprover } from '../fakes/auto-approve-tool-call-approver.ts';
import { CannedResultsToolProvider } from '../fakes/canned-results-tool-provider.ts';
import { connectPlatformToolProviderForEvals } from '../connect-platform-tool-provider-for-evals.ts';
import type { PromptfooAgentProviderConfig, PromptfooAgentRunMetadata } from './interfaces.ts';

/**
 * The platform's AI agent as a Promptfoo provider (`file://` in
 * `promptfoo-config.yaml`). Promptfoo evaluates a *provider* — something that
 * takes a prompt and answers — and here the provider is the whole agent: the
 * real loop, the real MCP tool catalog over the in-process link, canned tool
 * results (no Docker), one model client underneath. Which model is the
 * entry's `config` (`PromptfooAgentProviderConfig`), so one suite lines up
 * several models against the same agent, one instance per entry.
 *
 * The reply text is the output Promptfoo shows and asserts on; the tool calls
 * the loop executed travel in `metadata`, where `assert-tool-choice.ts` reads
 * them. The MCP link is opened on the first call and closed in `cleanup`.
 */
export default class PromptfooAgentProvider implements ApiProvider {
    /** The entry's parsed config, public because Promptfoo's `ApiProvider` exposes `config` and the results hook reads it. */
    readonly config: PromptfooAgentProviderConfig;
    private platformTools: McpToolProvider | undefined;
    private orchestrator: ToolCallingChatOrchestrator | undefined;

    constructor(options: ProviderOptions) {
        this.config = parsePromptfooAgentProviderConfig(options.config);
    }

    id(): string {
        return `agent:${this.config.llm}:${this.config.model}`;
    }

    async callApi(prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams): Promise<ProviderResponse> {
        const orchestrator: ToolCallingChatOrchestrator = await this.ensureOrchestrator();
        const turns: ChatTurn[] = buildTurns(prompt, context);
        let signal: AbortSignal;
        if (options !== undefined && options.abortSignal !== undefined) {
            signal = options.abortSignal;
        } else {
            signal = new AbortController().signal;
        }
        // Not auto-approved: the approver answers the ask, and the outcome records that it was asked.
        const result: AgentRunResult = await orchestrator.run(
            { turns: turns, autoApproveToolCalls: false },
            () => {},
            signal,
        );
        const metadata: PromptfooAgentRunMetadata = {
            toolCalls: result.toolCalls,
            stopReason: result.stopReason,
            modelCalls: result.modelCalls,
            peakPromptTokens: result.peakPromptTokens,
        };
        return { output: result.finalText, metadata: metadata };
    }

    async cleanup(): Promise<void> {
        if (this.platformTools !== undefined) {
            await this.platformTools.close();
            this.platformTools = undefined;
            this.orchestrator = undefined;
        }
    }

    private async ensureOrchestrator(): Promise<ToolCallingChatOrchestrator> {
        if (this.orchestrator !== undefined) {
            return this.orchestrator;
        }
        const platformTools: McpToolProvider = await connectPlatformToolProviderForEvals(config.DOCKER_HOST);
        this.platformTools = platformTools;
        this.orchestrator = new ToolCallingChatOrchestrator({
            llm: createLlmClient(this.config),
            tools: new CannedResultsToolProvider(platformTools),
            approver: new AutoApproveToolCallApprover(),
        });
        return this.orchestrator;
    }
}

/** The one place a provider name becomes a client; a second provider adds a branch here and a folder under `src/services/llm/`. */
function createLlmClient(providerConfig: PromptfooAgentProviderConfig): LlmClient {
    let baseUrl: string;
    if (providerConfig.baseUrl === undefined) {
        baseUrl = config.OLLAMA_URL;
    } else {
        baseUrl = providerConfig.baseUrl;
    }
    let contextTokens: number;
    if (providerConfig.contextTokens === undefined) {
        contextTokens = config.OLLAMA_NUM_CTX;
    } else {
        contextTokens = providerConfig.contextTokens;
    }
    return new OllamaLlmClient({ baseUrl: baseUrl, model: providerConfig.model, contextTokens: contextTokens });
}

/** The entry's `config` block as YAML delivers it (`unknown`), checked field by field so a typo fails the run at startup, not the model. */
function parsePromptfooAgentProviderConfig(rawConfig: unknown): PromptfooAgentProviderConfig {
    if (typeof rawConfig !== 'object' || rawConfig === null) {
        throw new Error('promptfoo agent provider: the entry needs a config block with `llm` and `model`');
    }
    const record = rawConfig as Record<string, unknown>;
    if (record.llm !== 'ollama') {
        throw new Error(`promptfoo agent provider: unknown llm ${JSON.stringify(record.llm)} (known: ollama)`);
    }
    if (typeof record.model !== 'string' || record.model === '') {
        throw new Error('promptfoo agent provider: `model` must be a non-empty string');
    }
    const parsed: PromptfooAgentProviderConfig = { llm: 'ollama', model: record.model };
    if (record.baseUrl !== undefined) {
        if (typeof record.baseUrl !== 'string') {
            throw new Error('promptfoo agent provider: `baseUrl` must be a string');
        }
        parsed.baseUrl = record.baseUrl;
    }
    if (record.contextTokens !== undefined) {
        if (typeof record.contextTokens !== 'number') {
            throw new Error('promptfoo agent provider: `contextTokens` must be a number');
        }
        parsed.contextTokens = record.contextTokens;
    }
    return parsed;
}

/** The conversation the run is given: the case's earlier turns (a var, when the case has them) and the prompt as its last user turn. */
function buildTurns(prompt: string, context: CallApiContextParams | undefined): ChatTurn[] {
    const promptTurn: ChatTurn = { role: 'user', text: prompt };
    if (context === undefined) {
        return [promptTurn];
    }
    const precedingTurns: unknown = context.vars.precedingTurns;
    if (!Array.isArray(precedingTurns)) {
        return [promptTurn];
    }
    return (precedingTurns as ChatTurn[]).concat([promptTurn]);
}
