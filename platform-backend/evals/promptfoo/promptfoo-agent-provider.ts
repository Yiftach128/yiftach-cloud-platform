import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, ProviderOptions, ProviderResponse } from 'promptfoo';
import type { McpToolProvider } from '../../src/mcp/client/mcp-tool-provider.ts';
import { config } from '../../src/config/config.ts';
import type { AgentRunResult, ChatTurn } from '../../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import type { LlmClient } from '../../src/services/llm/interfaces.ts';
import { LlmRequestError } from '../../src/services/llm/llm-request-error.ts';
import type { OllamaLlmClientOptions } from '../../src/services/llm/ollama/interfaces.ts';
import { OllamaLlmClient } from '../../src/services/llm/ollama/ollama-llm-client.ts';
import { AutoApproveToolCallApprover } from '../fakes/auto-approve-tool-call-approver.ts';
import { CannedResultsToolProvider } from '../fakes/canned-results-tool-provider.ts';
import { connectPlatformToolProviderForEvals } from '../connect-platform-tool-provider-for-evals.ts';
import type { PromptfooAgentProviderConfig, PromptfooAgentRunMetadata } from './interfaces.ts';
import { parsePromptfooAgentProviderConfig } from './parse-promptfoo-agent-provider-config.ts';

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
 *
 * One model at a time: `npm run eval -- --filter-providers <regex on the label
 * or id>`. With several entries in one run Promptfoo alternates the providers
 * row by row, and on a card that holds one model that is a model swap every
 * case.
 */
export default class PromptfooAgentProvider implements ApiProvider {
    /** The entry's parsed config, public because Promptfoo's `ApiProvider` exposes `config` and the results hook reads it. */
    readonly config: PromptfooAgentProviderConfig;
    private platformTools: McpToolProvider | undefined;
    private llm: LlmClient | undefined;

    constructor(options: ProviderOptions) {
        this.config = parsePromptfooAgentProviderConfig(options.config);
    }

    /** `agent:ollama:<model>`, plus `+<variant>` when the model has more than one column — Promptfoo tells entries apart by it. */
    id(): string {
        if (this.config.variant === undefined) {
            return `agent:${this.config.llm}:${this.config.model}`;
        }
        return `agent:${this.config.llm}:${this.config.model}+${this.config.variant}`;
    }

    async callApi(prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams): Promise<ProviderResponse> {
        const orchestrator: ToolCallingChatOrchestrator = await this.createOrchestratorForCase();
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
            this.llm = undefined;
        }
    }

    /**
     * A fresh orchestrator for each case over the shared MCP link and model
     * client (connected and checked once): the canned tools remember a case's
     * stops, so every case gets its own instance and starts from the same
     * platform.
     */
    private async createOrchestratorForCase(): Promise<ToolCallingChatOrchestrator> {
        if (this.platformTools === undefined) {
            this.platformTools = await connectPlatformToolProviderForEvals(config.DOCKER_HOST);
        }
        if (this.llm === undefined) {
            this.llm = await createLlmClientForReadyModel(this.config);
        }
        return new ToolCallingChatOrchestrator({
            llm: this.llm,
            tools: new CannedResultsToolProvider(this.platformTools),
            approver: new AutoApproveToolCallApprover(),
        });
    }
}

/**
 * The one place a provider name becomes a client; a second provider adds a
 * branch here and a folder under `src/services/llm/`. Before the client is
 * handed over, the model server is asked about the model, so a tag that was
 * never pulled, or a model that cannot call tools, fails the column with one
 * clear line instead of thirty rows of the model's own confusion.
 */
async function createLlmClientForReadyModel(providerConfig: PromptfooAgentProviderConfig): Promise<LlmClient> {
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
    const clientOptions: OllamaLlmClientOptions = { baseUrl: baseUrl, model: providerConfig.model, contextTokens: contextTokens };
    if (providerConfig.think !== undefined) {
        clientOptions.think = providerConfig.think;
    }
    const client: OllamaLlmClient = new OllamaLlmClient(clientOptions);

    let capabilities: string[];
    try {
        capabilities = await client.readModelCapabilities();
    } catch (error) {
        if (error instanceof LlmRequestError && error.status === 404) {
            throw new Error(
                `promptfoo agent provider: model ${providerConfig.model} is not pulled (\`ollama pull ${providerConfig.model}\` where Ollama runs)`,
                { cause: error },
            );
        }
        throw error;
    }
    if (!capabilities.includes('tools')) {
        throw new Error(
            `promptfoo agent provider: model ${providerConfig.model} cannot call tools (capabilities: ${capabilities.join(', ')}), so the agent cannot run on it`,
        );
    }
    return client;
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
