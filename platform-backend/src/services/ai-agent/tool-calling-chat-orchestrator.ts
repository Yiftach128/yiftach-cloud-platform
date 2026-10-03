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
 *   that keeps asking is forced to answer with what it has — and is told so,
 *   with the instruction to report unfinished work as unfinished, since a
 *   model handed no tools and an open request tends to claim it complied;
 * - unknown tools, repeated calls and failed calls are fed back to the model as
 *   results it can read and correct, never thrown;
 * - a destructive call (stop, restart, delete) runs only after the approver —
 *   the person chatting — has said yes, while a call that only adds (start,
 *   create, build) runs at once: a denied call is fed back as an error result,
 *   and asking for the same call again is refused without asking the person
 *   again;
 * - a run may say up front that its destructive calls need no ask (the
 *   person's auto-approve switch in the chat, sent with the request): they run
 *   at once, still flagged destructive, and are recorded as auto-approved;
 * - one model turn may ask for several tools: read-only calls run concurrently,
 *   anything else one at a time in the order asked (so approvals are asked one
 *   at a time too), and calls past the per-turn cap are refused in band —
 *   every call gets a result message either way;
 * - tool results share a character budget, so they cannot push the conversation
 *   out of the model's context window (which the model server would truncate
 *   silently);
 * - the conversation itself has a character budget too: of a long one, the
 *   model reads only the newest turns that fit;
 * - every run is handed to a tracer — each model call with the exact request
 *   the model read, each event, and how the run ended — so a reply that went
 *   wrong can be replayed afterwards; the default tracer keeps nothing.
 *
 * Stateless: a run takes the whole conversation and keeps nothing afterwards.
 */

import type {
    LlmChatRequest,
    LlmClient,
    LlmMessage,
    LlmReply,
    LlmToolCall,
    LlmToolDefinition,
} from '../llm/interfaces.ts';
import { buildAgentSystemPrompt } from './build-agent-system-prompt.ts';
import type {
    AgentEvent,
    AgentRunRequest,
    AgentRunResult,
    AgentRunTrace,
    AgentRunTracer,
    AgentStopReason,
    AgentTool,
    ChatTurn,
    ExecutedToolCall,
    RunToolCallLedger,
    ToolCallApprovalOutcome,
    ToolCallApprover,
    ToolCallDecision,
    ToolCallingChatOrchestratorOptions,
    ToolCallOutcome,
    ToolProvider,
} from './interfaces.ts';
import { mapAgentToolToLlmToolDefinition } from './map-agent-tool-to-llm-tool-definition.ts';
import { NoOpAgentRunTracer } from './no-op-agent-run-tracer.ts';
import { selectRecentTurnsWithinBudget } from './select-recent-turns-within-budget.ts';
import { trimToolResultToBudget } from './trim-tool-result-to-budget.ts';

const DEFAULT_MAX_MODEL_CALLS = 6;
const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 5;
const DEFAULT_TOOL_RESULT_BUDGET_CHARS = 12_000;
/**
 * What an 8192-token window leaves for the conversation once the system prompt
 * with the fifteen tool schemas (about 3000 tokens, measured from a chat trace),
 * a spent tool-result budget (about 3500) and the answer being written (about
 * 800) are set aside: about 900 tokens, some 3600 characters of chat text.
 */
const DEFAULT_HISTORY_BUDGET_CHARS = 3_600;
/** The most one model turn may spend of the run's budget, so a greedy first turn cannot starve the later ones. */
const TURN_BUDGET_SHARE = 0.5;
/** Floor per result: enough for an error message or a short answer even when the budget is spent. */
const MIN_RESULT_CHARS = 300;
/**
 * Appended for the capped last call, which offers no tools: without it the model
 * reads a normal turn whose tools happen to be missing, and one that spent its
 * calls trying to do something tends to write the ending the conversation seems
 * to want ("it is now stopped"). Goes after the tool results, so the prefix the
 * earlier calls shared stays cacheable.
 */
const NO_TOOLS_LEFT_NOTICE =
    'You have used all the tool calls allowed for this reply, so no tools are available now. Answer with '
    + 'what you already know. If something you were asked to do was not done, say so plainly instead of '
    + 'claiming it was.';

export class ToolCallingChatOrchestrator {
    private readonly llm: LlmClient;
    private readonly tools: ToolProvider;
    private readonly approver: ToolCallApprover;
    private readonly tracer: AgentRunTracer;
    private readonly maxModelCalls: number;
    private readonly maxToolCallsPerTurn: number;
    private readonly toolResultBudgetChars: number;
    private readonly historyBudgetChars: number;

    constructor(options: ToolCallingChatOrchestratorOptions) {
        this.llm = options.llm;
        this.tools = options.tools;
        this.approver = options.approver;
        if (options.tracer === undefined) {
            this.tracer = new NoOpAgentRunTracer();
        } else {
            this.tracer = options.tracer;
        }
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
        if (options.historyBudgetChars === undefined) {
            this.historyBudgetChars = DEFAULT_HISTORY_BUDGET_CHARS;
        } else {
            this.historyBudgetChars = options.historyBudgetChars;
        }
    }

    /**
     * Answers the conversation in `request.turns`. `onEvent` reports progress live (text
     * fragments, tool calls, approvals, tool results); the resolved result is
     * the summary of the whole run. Aborting `signal` ends the run early — a
     * call still waiting for approval is dropped — and the promise still
     * resolves, with `stopReason: 'aborted'`. Rejects only when the model
     * server fails (`LlmUnavailableError`, `LlmRequestError`) or the tool list
     * cannot be read.
     */
    async run(
        request: AgentRunRequest,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<AgentRunResult> {
        const tools: AgentTool[] = await this.tools.listTools();
        const toolsByName: Map<string, AgentTool> = new Map();
        for (const tool of tools) {
            toolsByName.set(tool.name, tool);
        }
        const toolDefinitions: LlmToolDefinition[] = tools.map(mapAgentToolToLlmToolDefinition);
        const allToolsReadOnly: boolean = tools.every((tool: AgentTool) => tool.readOnly);

        const systemPrompt: string = buildAgentSystemPrompt(this.tools.getUsageInstructions(), allToolsReadOnly, new Date());
        const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt }];
        for (const turn of selectRecentTurnsWithinBudget(request.turns, this.historyBudgetChars)) {
            messages.push(toLlmMessage(turn));
        }

        // The trace opens once the request is settled, so its header holds what every
        // model call of the run starts from; every event goes to it before it goes out.
        const trace: AgentRunTrace = this.tracer.startRun({
            request: request,
            systemPrompt: systemPrompt,
            tools: toolDefinitions,
        });
        const reportEvent = (event: AgentEvent): void => {
            trace.recordEvent(event);
            onEvent(event);
        };

        const executedToolCalls: ExecutedToolCall[] = [];
        const ledger: RunToolCallLedger = { executedCallKeys: new Set(), deniedCallKeys: new Set() };
        let remainingBudgetChars: number = this.toolResultBudgetChars;
        let peakPromptTokens: number = 0;
        let modelCalls: number = 0;
        // The id the next tool call gets: whoever watches the events pairs a result with its call by it.
        let nextCallId: number = 1;

        const finish = (finalText: string, stopReason: AgentStopReason): AgentRunResult => {
            const result: AgentRunResult = {
                finalText: finalText,
                stopReason: stopReason,
                toolCalls: executedToolCalls,
                modelCalls: modelCalls,
                peakPromptTokens: peakPromptTokens,
            };
            trace.finishRun(result);
            return result;
        };

        try {
            while (true) {
                modelCalls = modelCalls + 1;
                const isLastAllowedCall: boolean = modelCalls >= this.maxModelCalls;
                let offeredTools: LlmToolDefinition[];
                if (isLastAllowedCall) {
                    offeredTools = [];
                    messages.push({ role: 'system', content: NO_TOOLS_LEFT_NOTICE });
                } else {
                    offeredTools = toolDefinitions;
                }

                const llmRequest: LlmChatRequest = { messages: messages, tools: offeredTools };
                const callStartedAt: number = Date.now();
                const reply: LlmReply = await this.llm.streamChat(
                    llmRequest,
                    (textDelta: string): void => reportEvent({ type: 'delta', text: textDelta }),
                    signal,
                );
                trace.recordModelCall({
                    callNumber: modelCalls,
                    request: llmRequest,
                    reply: reply,
                    durationMs: Date.now() - callStartedAt,
                    aborted: signal.aborted,
                });
                peakPromptTokens = Math.max(peakPromptTokens, reply.promptTokens);

                if (signal.aborted) {
                    return finish(reply.content, 'aborted');
                }
                if (isLastAllowedCall) {
                    // The forced answer, whatever it looks like: no tools were offered, so any
                    // tool calls in it are the model's invention — the text is all there is.
                    return finish(reply.content, 'model_call_limit');
                }
                if (reply.toolCalls.length === 0) {
                    return finish(reply.content, 'answered');
                }

                messages.push({ role: 'assistant', content: reply.content, toolCalls: reply.toolCalls });

                const turnBudgetChars: number = Math.min(
                    remainingBudgetChars,
                    Math.floor(this.toolResultBudgetChars * TURN_BUDGET_SHARE),
                );
                const completedCalls: ExecutedToolCall[] = await this.runToolCalls(
                    reply.toolCalls, nextCallId, toolsByName, ledger, turnBudgetChars,
                    request.autoApproveToolCalls, reportEvent, signal,
                );
                nextCallId = nextCallId + reply.toolCalls.length;

                // Results go back in the order the calls were asked, whatever order they finished in.
                for (const completed of completedCalls) {
                    messages.push({
                        role: 'tool',
                        toolName: completed.name,
                        toolCallId: completed.llmToolCallId,
                        content: completed.resultText,
                    });
                    executedToolCalls.push(completed);
                    remainingBudgetChars = Math.max(0, remainingBudgetChars - completed.resultText.length);
                }

                if (signal.aborted) {
                    return finish('', 'aborted');
                }
            }
        } catch (error) {
            // The model server failed: the trace says so, and the caller gets the rejection as before.
            trace.failRun(error);
            throw error;
        }
    }

    /**
     * Runs the tool calls of one model turn and returns one completed call per
     * call asked, in call order. The calls are numbered from `firstCallId` in
     * that same order, refused ones included.
     */
    private async runToolCalls(
        calls: LlmToolCall[],
        firstCallId: number,
        toolsByName: Map<string, AgentTool>,
        ledger: RunToolCallLedger,
        turnBudgetChars: number,
        autoApproveToolCalls: boolean,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<ExecutedToolCall[]> {
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

        let completedCalls: ExecutedToolCall[];
        if (everyCallReadOnly) {
            completedCalls = await Promise.all(acceptedCalls.map((call: LlmToolCall, index: number) => {
                return this.runOneToolCall(
                    firstCallId + index, call, toolsByName, ledger, perCallBudgetChars,
                    autoApproveToolCalls, onEvent, signal,
                );
            }));
        } else {
            completedCalls = [];
            let callId: number = firstCallId;
            for (const call of acceptedCalls) {
                completedCalls.push(await this.runOneToolCall(
                    callId, call, toolsByName, ledger, perCallBudgetChars, autoApproveToolCalls, onEvent, signal,
                ));
                callId = callId + 1;
            }
        }

        let refusedCallId: number = firstCallId + acceptedCalls.length;
        for (const call of refusedCalls) {
            const refusalText: string =
                `Not run: at most ${this.maxToolCallsPerTurn} tool calls are allowed per turn. `
                + 'Ask again in your next turn if you still need it.';
            onEvent({
                type: 'tool_call',
                callId: refusedCallId,
                name: call.name,
                arguments: call.arguments,
                needsApproval: false,
                destructive: false,
            });
            onEvent({ type: 'tool_result', callId: refusedCallId, name: call.name, isError: true, text: refusalText });
            completedCalls.push({
                name: call.name,
                arguments: call.arguments,
                llmToolCallId: call.id,
                isError: true,
                resultText: refusalText,
                approval: 'not_needed',
            });
            refusedCallId = refusedCallId + 1;
        }
        return completedCalls;
    }

    /**
     * Reports, decides, runs and trims one call. Never rejects: whatever goes
     * wrong becomes a result the model can read.
     */
    private async runOneToolCall(
        callId: number,
        call: LlmToolCall,
        toolsByName: Map<string, AgentTool>,
        ledger: RunToolCallLedger,
        budgetChars: number,
        autoApproveToolCalls: boolean,
        onEvent: (event: AgentEvent) => void,
        signal: AbortSignal,
    ): Promise<ExecutedToolCall> {
        // Small models sometimes loop on one call. Checked and recorded before the
        // first await, so two identical calls in one concurrent batch are caught too.
        const callKey: string = `${call.name} ${JSON.stringify(call.arguments)}`;
        const refusal: ToolCallOutcome | undefined = findReasonToRefuse(call, callKey, toolsByName, ledger);

        // `needsApproval` means "is now waiting for the person": only a destructive
        // call is asked, a call refused up front (unknown, a repeat, denied before)
        // never waits, and a run that auto-approves runs the call at once instead —
        // recorded as such, and still flagged destructive.
        const tool: AgentTool | undefined = toolsByName.get(call.name);
        let needsApproval: boolean;
        let autoApproved: boolean;
        let destructive: boolean;
        if (tool === undefined) {
            needsApproval = false;
            autoApproved = false;
            destructive = false;
        } else {
            const wouldAsk: boolean = tool.destructive && refusal === undefined;
            needsApproval = wouldAsk && !autoApproveToolCalls;
            autoApproved = wouldAsk && autoApproveToolCalls;
            destructive = tool.destructive;
        }
        onEvent({
            type: 'tool_call',
            callId: callId,
            name: call.name,
            arguments: call.arguments,
            needsApproval: needsApproval,
            destructive: destructive,
        });

        let approval: ToolCallApprovalOutcome = 'not_needed';
        let outcome: ToolCallOutcome;
        if (refusal !== undefined) {
            outcome = refusal;
        } else {
            ledger.executedCallKeys.add(callKey);
            if (needsApproval) {
                const decision: ToolCallDecision = await this.approver.requestApproval(
                    { callId: callId, name: call.name, arguments: call.arguments, destructive: destructive },
                    signal,
                );
                if (signal.aborted) {
                    // The run is over: nothing runs, and no decision is reported — the
                    // watcher settles the waiting call as stopped by itself.
                    approval = 'denied';
                    outcome = { text: 'Not run: the conversation was stopped before the call was decided.', isError: true };
                } else {
                    onEvent({ type: 'tool_approval', callId: callId, name: call.name, decision: decision });
                    if (decision === 'denied') {
                        ledger.deniedCallKeys.add(callKey);
                        approval = 'denied';
                        outcome = {
                            text: `The user denied this call, so ${call.name} was not run. Do not ask for it again: `
                                + 'tell the user what was not done and ask how they want to proceed.',
                            isError: true,
                        };
                    } else {
                        approval = 'approved';
                        outcome = await this.executeToolCall(call, signal);
                    }
                }
            } else if (autoApproved) {
                approval = 'auto_approved';
                outcome = await this.executeToolCall(call, signal);
            } else {
                outcome = await this.executeToolCall(call, signal);
            }
        }

        const resultText: string = trimToolResultToBudget(outcome.text, budgetChars);
        onEvent({ type: 'tool_result', callId: callId, name: call.name, isError: outcome.isError, text: resultText });
        return {
            name: call.name,
            arguments: call.arguments,
            llmToolCallId: call.id,
            isError: outcome.isError,
            resultText: resultText,
            approval: approval,
        };
    }

    /** Never rejects: a tool that throws becomes an outcome the model can read. */
    private async executeToolCall(call: LlmToolCall, signal: AbortSignal): Promise<ToolCallOutcome> {
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

/** The in-band refusal for a call that must not run at all, or undefined when it may. */
function findReasonToRefuse(
    call: LlmToolCall,
    callKey: string,
    toolsByName: Map<string, AgentTool>,
    ledger: RunToolCallLedger,
): ToolCallOutcome | undefined {
    if (!toolsByName.has(call.name)) {
        const available: string = Array.from(toolsByName.keys()).join(', ');
        return { text: `Unknown tool "${call.name}". The available tools are: ${available}.`, isError: true };
    }
    if (ledger.deniedCallKeys.has(callKey)) {
        return {
            text: `The user already denied ${call.name} with exactly these arguments in this conversation. `
                + 'Do not ask for it again; tell the user what was not done.',
            isError: true,
        };
    }
    if (ledger.executedCallKeys.has(callKey)) {
        return {
            text: `You already called ${call.name} with exactly these arguments in this conversation. `
                + 'Use that result and answer the user instead of calling it again.',
            isError: true,
        };
    }
    return undefined;
}

function toLlmMessage(turn: ChatTurn): LlmMessage {
    if (turn.role === 'assistant') {
        return { role: 'assistant', content: turn.text, toolCalls: [] };
    }
    return { role: 'user', content: turn.text };
}
