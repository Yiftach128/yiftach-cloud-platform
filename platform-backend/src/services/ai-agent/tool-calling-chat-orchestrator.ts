/**
 * The agent loop: answers one chat by letting a language model call tools.
 *
 * Each round sends the conversation plus the tool schemas to the model. A reply
 * that asks for tools gets them run and their results appended, and the model
 * is called again; a reply that is plain text is the answer and ends the run.
 * The model only ever *asks* — every tool call is executed here, which is where
 * the defensive policy lives:
 *
 * - a cap on model calls, whose last call is made without tools, so a model
 *   that keeps asking is forced to answer with what it has;
 * - unknown tools, repeated calls and failed calls are fed back to the model as
 *   results it can read and correct, never thrown;
 * - one model turn may ask for several tools: read-only calls run concurrently,
 *   anything else one at a time in the order asked, and calls past the per-turn
 *   cap are refused in band — every call gets a result message either way;
 * - tool results share a character budget, so they cannot push the conversation
 *   out of the model's context window (which the model server would truncate
 *   silently).
 *
 * Stateless: a run takes the whole conversation and keeps nothing afterwards.
 */

import type {
    LlmClient,
    LlmMessage,
    LlmReply,
    LlmToolCall,
    LlmToolDefinition,
} from '../llm/interfaces.ts';
import { buildAgentSystemPrompt } from './build-agent-system-prompt.ts';
import type {
    AgentEvent,
    AgentRunResult,
    AgentStopReason,
    AgentTool,
    ChatTurn,
    ExecutedToolCall,
    ToolCallingChatOrchestratorOptions,
    ToolCallOutcome,
    ToolProvider,
} from './interfaces.ts';
import { trimToolResultToBudget } from './trim-tool-result-to-budget.ts';

const DEFAULT_MAX_MODEL_CALLS = 6;
const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 5;
const DEFAULT_TOOL_RESULT_BUDGET_CHARS = 12_000;
/** The most one model turn may spend of the run's budget, so a greedy first turn cannot starve the later ones. */
const TURN_BUDGET_SHARE = 0.5;
/** Floor per result: enough for an error message or a short answer even when the budget is spent. */
const MIN_RESULT_CHARS = 300;

export class ToolCallingChatOrchestrator {
    private readonly llm: LlmClient;
    private readonly tools: ToolProvider;
    private readonly maxModelCalls: number;
    private readonly maxToolCallsPerTurn: number;
    private readonly toolResultBudgetChars: number;

    constructor(options: ToolCallingChatOrchestratorOptions) {
        this.llm = options.llm;
        this.tools = options.tools;
        if (options.maxModelCalls === undefined) {
            this.maxModelCalls = DEFAULT_MAX_MODEL_CALLS;
        } else {
            this.maxModelCalls = options.maxModelCalls;
        }
        if (options.maxToolCallsPerTurn === undefined) {
            this.maxToolCallsPerTurn = DEFAULT_MAX_TOOL_CALLS_PER_TURN;
        } else {
            this.maxToolCallsPerTurn = options.maxToolCallsPerTurn;
        }
        if (options.toolResultBudgetChars === undefined) {
            this.toolResultBudgetChars = DEFAULT_TOOL_RESULT_BUDGET_CHARS;
        } else {
            this.toolResultBudgetChars = options.toolResultBudgetChars;
        }
    }

    /**
     * Answers the conversation in `turns`. `onEvent` reports progress live (text
     * fragments, tool calls, tool results); the resolved result is the summary
     * of the whole run. Aborting `signal` ends the run early and the promise
     * still resolves, with `stopReason: 'aborted'`. Rejects only when the model
     * server fails (`LlmUnavailableError`, `LlmRequestError`) or the tool list
     * cannot be read.
     */
    async run(turns: ChatTurn[], onEvent: (event: AgentEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
        const tools: AgentTool[] = await this.tools.listTools();
        const toolsByName: Map<string, AgentTool> = new Map();
        for (const tool of tools) {
            toolsByName.set(tool.name, tool);
        }
        const toolDefinitions: LlmToolDefinition[] = tools.map(toLlmToolDefinition);
        const allToolsReadOnly: boolean = tools.every((tool: AgentTool) => tool.readOnly);

        const messages: LlmMessage[] = [{
            role: 'system',
            content: buildAgentSystemPrompt(this.tools.getUsageInstructions(), allToolsReadOnly, new Date()),
        }];
        for (const turn of turns) {
            messages.push(toLlmMessage(turn));
        }

        const executedToolCalls: ExecutedToolCall[] = [];
        const executedCallKeys: Set<string> = new Set();
        let remainingBudgetChars: number = this.toolResultBudgetChars;
        let peakPromptTokens: number = 0;
        let modelCalls: number = 0;

        const finish = (finalText: string, stopReason: AgentStopReason): AgentRunResult => {
            return {
                finalText: finalText,
                stopReason: stopReason,
                toolCalls: executedToolCalls,
                modelCalls: modelCalls,
                peakPromptTokens: peakPromptTokens,
            };
        };

        while (true) {
            modelCalls = modelCalls + 1;
            const isLastAllowedCall: boolean = modelCalls >= this.maxModelCalls;
            let offeredTools: LlmToolDefinition[];
            if (isLastAllowedCall) {
                offeredTools = [];
            } else {
                offeredTools = toolDefinitions;
            }

            const reply: LlmReply = await this.llm.streamChat(
                { messages: messages, tools: offeredTools },
                (textDelta: string): void => onEvent({ type: 'delta', text: textDelta }),
                signal,
            );
            peakPromptTokens = Math.max(peakPromptTokens, reply.promptTokens);

            if (signal.aborted) {
                return finish(reply.content, 'aborted');
            }
            if (reply.toolCalls.length === 0) {
                return finish(reply.content, 'answered');
            }
            if (isLastAllowedCall) {
                // No tools were offered, so these calls are the model's invention — the text is all there is.
                return finish(reply.content, 'model_call_limit');
            }

            messages.push({ role: 'assistant', content: reply.content, toolCalls: reply.toolCalls });

            const turnBudgetChars: number = Math.min(
                remainingBudgetChars,
                Math.floor(this.toolResultBudgetChars * TURN_BUDGET_SHARE),
            );
            const outcomes: ToolCallOutcome[] = await this.runToolCalls(
                reply.toolCalls, toolsByName, executedCallKeys, turnBudgetChars, onEvent, signal,
            );

            // Results go back in the order the calls were asked, whatever order they finished in.
            for (let index = 0; index < reply.toolCalls.length; index++) {
                const call: LlmToolCall | undefined = reply.toolCalls[index];
                const outcome: ToolCallOutcome | undefined = outcomes[index];
                if (call === undefined || outcome === undefined) {
                    continue;
                }
                messages.push({ role: 'tool', toolName: call.name, content: outcome.text });
                executedToolCalls.push({ name: call.name, arguments: call.arguments, isError: outcome.isError });
                remainingBudgetChars = Math.max(0, remainingBudgetChars - outcome.text.length);
            }

            if (signal.aborted) {
                return finish('', 'aborted');
            }
        }
    }

    /** Runs the tool calls of one model turn and returns one outcome per call, in call order. */
    private async runToolCalls(
        calls: LlmToolCall[],
        toolsByName: Map<string, AgentTool>,
        executedCallKeys: Set<string>,
        turnBudgetChars: number,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<ToolCallOutcome[]> {
        const acceptedCalls: LlmToolCall[] = calls.slice(0, this.maxToolCallsPerTurn);
        const refusedCalls: LlmToolCall[] = calls.slice(this.maxToolCallsPerTurn);
        const perCallBudgetChars: number = Math.max(
            MIN_RESULT_CHARS,
            Math.floor(turnBudgetChars / acceptedCalls.length),
        );

        let everyCallReadOnly: boolean = true;
        for (const call of acceptedCalls) {
            const tool: AgentTool | undefined = toolsByName.get(call.name);
            if (tool !== undefined && !tool.readOnly) {
                everyCallReadOnly = false;
            }
        }

        let outcomes: ToolCallOutcome[];
        if (everyCallReadOnly) {
            outcomes = await Promise.all(acceptedCalls.map((call: LlmToolCall) => {
                return this.runOneToolCall(call, toolsByName, executedCallKeys, perCallBudgetChars, onEvent, signal);
            }));
        } else {
            outcomes = [];
            for (const call of acceptedCalls) {
                outcomes.push(
                    await this.runOneToolCall(call, toolsByName, executedCallKeys, perCallBudgetChars, onEvent, signal),
                );
            }
        }

        for (const call of refusedCalls) {
            const refusal: ToolCallOutcome = {
                text: `Not run: at most ${this.maxToolCallsPerTurn} tool calls are allowed per turn. `
                    + 'Ask again in your next turn if you still need it.',
                isError: true,
            };
            onEvent({ type: 'tool_call', name: call.name, arguments: call.arguments });
            onEvent({ type: 'tool_result', name: call.name, isError: true, text: refusal.text });
            outcomes.push(refusal);
        }
        return outcomes;
    }

    private async runOneToolCall(
        call: LlmToolCall,
        toolsByName: Map<string, AgentTool>,
        executedCallKeys: Set<string>,
        budgetChars: number,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<ToolCallOutcome> {
        onEvent({ type: 'tool_call', name: call.name, arguments: call.arguments });
        const outcome: ToolCallOutcome = await this.resolveToolCall(call, toolsByName, executedCallKeys, signal);
        const trimmed: ToolCallOutcome = {
            text: trimToolResultToBudget(outcome.text, budgetChars),
            isError: outcome.isError,
        };
        onEvent({ type: 'tool_result', name: call.name, isError: trimmed.isError, text: trimmed.text });
        return trimmed;
    }

    /** Never rejects: whatever goes wrong becomes an outcome the model can read. */
    private async resolveToolCall(
        call: LlmToolCall,
        toolsByName: Map<string, AgentTool>,
        executedCallKeys: Set<string>,
        signal: AbortSignal,
    ): Promise<ToolCallOutcome> {
        if (!toolsByName.has(call.name)) {
            const available: string = Array.from(toolsByName.keys()).join(', ');
            return { text: `Unknown tool "${call.name}". The available tools are: ${available}.`, isError: true };
        }

        // Small models sometimes loop on one call. Checked and recorded before the
        // first await, so two identical calls in one concurrent batch are caught too.
        const callKey: string = `${call.name} ${JSON.stringify(call.arguments)}`;
        if (executedCallKeys.has(callKey)) {
            return {
                text: `You already called ${call.name} with exactly these arguments in this conversation. `
                    + 'Use that result and answer the user instead of calling it again.',
                isError: true,
            };
        }
        executedCallKeys.add(callKey);

        try {
            return await this.tools.callTool(call.name, call.arguments, signal);
        } catch (error) {
            let message: string;
            if (error instanceof Error) {
                message = error.message;
            } else {
                message = String(error);
            }
            return { text: `The tool failed unexpectedly: ${message}`, isError: true };
        }
    }
}

function toLlmToolDefinition(tool: AgentTool): LlmToolDefinition {
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

function toLlmMessage(turn: ChatTurn): LlmMessage {
    if (turn.role === 'assistant') {
        return { role: 'assistant', content: turn.text, toolCalls: [] };
    }
    return { role: 'user', content: turn.text };
}
