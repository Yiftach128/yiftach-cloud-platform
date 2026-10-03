/**
 * Entry point for replaying one model call of a recorded chat run
 * (`npm run replay:model-call -- chat-traces/<file>.jsonl [callNumber] [--current-prompt]`).
 *
 * A chat trace (`CHAT_TRACE_DIR`, written by `src/services/chat-traces/`) holds
 * every model call of a run with the exact messages the model read. This sends
 * one of them — the last by default, the one that produced the answer — to the
 * configured Ollama again and prints the recorded reply beside the new one. At
 * temperature 0 the same model gives the same reply, so a wrong answer
 * reproduces here in seconds, without the chat, Docker or the tools.
 *
 * `--current-prompt` keeps the recorded conversation but rebuilds the system
 * prompt and the tool definitions from the code as it is now (the platform's
 * real MCP catalog, in process): the loop for fixing a prompt — edit
 * `build-agent-system-prompt.ts` or a tool description, replay, see whether the
 * model now chooses right. The recorded start time stays the prompt's "now".
 * Exits 2 on a usage or trace-file error.
 */

import { readFileSync } from 'node:fs';
import { config } from '../src/config/config.ts';
import { buildAgentSystemPrompt } from '../src/services/ai-agent/build-agent-system-prompt.ts';
import type { AgentTool, ChatTurn } from '../src/services/ai-agent/interfaces.ts';
import { mapAgentToolToLlmToolDefinition } from '../src/services/ai-agent/map-agent-tool-to-llm-tool-definition.ts';
import type {
    ChatTraceModelCallRecord,
    ChatTraceRecord,
    ChatTraceRunStartRecord,
} from '../src/services/chat-traces/interfaces.ts';
import type {
    LlmChatRequest,
    LlmMessage,
    LlmReply,
    LlmToolCall,
    LlmToolDefinition,
} from '../src/services/llm/interfaces.ts';
import { OllamaLlmClient } from '../src/services/llm/ollama/ollama-llm-client.ts';
import { connectPlatformToolProviderForEvals } from './connect-platform-tool-provider-for-evals.ts';

const CURRENT_PROMPT_FLAG = '--current-prompt';
const TURN_PREVIEW_CHARS = 200;

interface ReplayArguments {
    traceFile: string;
    /** Undefined selects the last call of the run. */
    callNumber: number | undefined;
    useCurrentPrompt: boolean;
}

async function main(): Promise<void> {
    const replayArguments: ReplayArguments | undefined = parseArguments(process.argv.slice(2));
    if (replayArguments === undefined) {
        console.error(`usage: npm run replay:model-call -- <trace.jsonl> [callNumber] [${CURRENT_PROMPT_FLAG}]`);
        process.exitCode = 2;
        return;
    }

    const records: ChatTraceRecord[] = readTraceRecords(replayArguments.traceFile);
    const header: ChatTraceRunStartRecord | undefined = findRunStart(records);
    const modelCalls: ChatTraceModelCallRecord[] = selectModelCalls(records);
    if (header === undefined || modelCalls.length === 0) {
        console.error(`${replayArguments.traceFile}: not a chat trace with model calls`);
        process.exitCode = 2;
        return;
    }
    let call: ChatTraceModelCallRecord | undefined;
    if (replayArguments.callNumber === undefined) {
        call = modelCalls[modelCalls.length - 1];
    } else {
        const wanted: number = replayArguments.callNumber;
        call = modelCalls.find((candidate: ChatTraceModelCallRecord) => candidate.callNumber === wanted);
    }
    if (call === undefined) {
        console.error(`call ${replayArguments.callNumber} is not in this trace; it has calls 1 to ${modelCalls.length}`);
        process.exitCode = 2;
        return;
    }

    printRunSummary(header, modelCalls.length);
    if (config.OLLAMA_MODEL !== header.model) {
        console.log(`note: replaying on ${config.OLLAMA_MODEL}; the trace was made on ${header.model}`);
    }

    let messages: LlmMessage[] = call.messages;
    let tools: LlmToolDefinition[];
    if (call.toolsOffered) {
        tools = header.tools;
    } else {
        tools = [];
    }
    if (replayArguments.useCurrentPrompt) {
        const platformTools = await connectPlatformToolProviderForEvals(config.DOCKER_HOST);
        const currentTools: AgentTool[] = await platformTools.listTools();
        const allToolsReadOnly: boolean = currentTools.every((tool: AgentTool) => tool.readOnly);
        const systemPrompt: string = buildAgentSystemPrompt(
            platformTools.getUsageInstructions(), allToolsReadOnly, new Date(header.startedAt),
        );
        messages = replaceSystemMessage(call.messages, systemPrompt);
        if (call.toolsOffered) {
            tools = currentTools.map(mapAgentToolToLlmToolDefinition);
        }
        await platformTools.close();
    }
    const request: LlmChatRequest = { messages: messages, tools: tools };

    const recordedSeconds: string = (call.durationMs / 1000).toFixed(1);
    console.log(
        `\nrecorded reply — call ${call.callNumber} of ${modelCalls.length}, ${recordedSeconds}s, `
        + `prompt ${call.reply.promptTokens} of ${header.contextTokens} tokens:`,
    );
    printReply(call.reply);

    let mode: string;
    if (replayArguments.useCurrentPrompt) {
        mode = 'the current system prompt and tool definitions';
    } else {
        mode = 'the recorded prompt, exactly';
    }
    console.log(`\nreplaying with ${mode}...\n`);

    const llm = new OllamaLlmClient({
        baseUrl: config.OLLAMA_URL,
        model: config.OLLAMA_MODEL,
        contextTokens: config.OLLAMA_NUM_CTX,
    });
    const startedAt: number = Date.now();
    const reply: LlmReply = await llm.streamChat(
        request,
        (textDelta: string): void => {
            process.stdout.write(textDelta);
        },
        new AbortController().signal,
    );
    const seconds: string = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (reply.content !== '') {
        console.log('');
    }
    console.log(formatToolCalls(reply.toolCalls));
    console.log(`\n[${seconds}s, prompt ${reply.promptTokens} of ${config.OLLAMA_NUM_CTX} tokens]`);

    if (toComparableToolCallsText(reply.toolCalls) === toComparableToolCallsText(call.reply.toolCalls)) {
        console.log('tool calls: same as recorded');
    } else {
        console.log('tool calls: DIFFERENT from the recorded ones');
    }
    if (reply.content === call.reply.content) {
        console.log('text: same as recorded');
    } else {
        console.log('text: different from the recorded one');
    }
}

/** Undefined when the arguments do not make sense. */
function parseArguments(rawArguments: string[]): ReplayArguments | undefined {
    let traceFile: string | undefined;
    let callNumber: number | undefined;
    let useCurrentPrompt: boolean = false;
    for (const rawArgument of rawArguments) {
        if (rawArgument === CURRENT_PROMPT_FLAG) {
            useCurrentPrompt = true;
        } else if (traceFile === undefined) {
            traceFile = rawArgument;
        } else if (callNumber === undefined && /^[1-9][0-9]*$/.test(rawArgument)) {
            callNumber = Number(rawArgument);
        } else {
            return undefined;
        }
    }
    if (traceFile === undefined) {
        return undefined;
    }
    return { traceFile: traceFile, callNumber: callNumber, useCurrentPrompt: useCurrentPrompt };
}

/** One record per non-empty line. The file is the tracer's own, so its lines are trusted to have the recorded shapes. */
function readTraceRecords(traceFile: string): ChatTraceRecord[] {
    const records: ChatTraceRecord[] = [];
    for (const line of readFileSync(traceFile, 'utf8').split('\n')) {
        if (line.trim() === '') {
            continue;
        }
        records.push(JSON.parse(line) as ChatTraceRecord);
    }
    return records;
}

function findRunStart(records: ChatTraceRecord[]): ChatTraceRunStartRecord | undefined {
    for (const record of records) {
        if (record.type === 'run_start') {
            return record;
        }
    }
    return undefined;
}

function selectModelCalls(records: ChatTraceRecord[]): ChatTraceModelCallRecord[] {
    const modelCalls: ChatTraceModelCallRecord[] = [];
    for (const record of records) {
        if (record.type === 'model_call') {
            modelCalls.push(record);
        }
    }
    return modelCalls;
}

function replaceSystemMessage(messages: LlmMessage[], systemPrompt: string): LlmMessage[] {
    return messages.map((message: LlmMessage): LlmMessage => {
        if (message.role === 'system') {
            return { role: 'system', content: systemPrompt };
        }
        return message;
    });
}

function printRunSummary(header: ChatTraceRunStartRecord, modelCallCount: number): void {
    console.log(
        `run ${header.runId} of ${header.startedAt}: model ${header.model}, ${modelCallCount} model calls, `
        + `${header.turns.length} turns, auto-approve ${header.autoApproveToolCalls}`,
    );
    const lastUserTurn: ChatTurn | undefined = header.turns.filter((turn: ChatTurn) => turn.role === 'user').pop();
    if (lastUserTurn !== undefined) {
        let preview: string = lastUserTurn.text;
        if (preview.length > TURN_PREVIEW_CHARS) {
            preview = `${preview.substring(0, TURN_PREVIEW_CHARS)}...`;
        }
        console.log(`user: ${JSON.stringify(preview)}`);
    }
}

function printReply(reply: LlmReply): void {
    if (reply.content !== '') {
        console.log(reply.content);
    }
    console.log(formatToolCalls(reply.toolCalls));
}

function formatToolCalls(toolCalls: LlmToolCall[]): string {
    if (toolCalls.length === 0) {
        return '  (no tool calls)';
    }
    return toolCalls
        .map((toolCall: LlmToolCall) => `  -> ${toolCall.name} ${JSON.stringify(toolCall.arguments)}`)
        .join('\n');
}

/** The calls as text with their argument keys sorted, so two replies compare by content, not by key order. */
function toComparableToolCallsText(toolCalls: LlmToolCall[]): string {
    return toolCalls
        .map((toolCall: LlmToolCall) => {
            const sortedKeys: string[] = Object.keys(toolCall.arguments).sort();
            const sortedArguments: Record<string, unknown> = {};
            for (const key of sortedKeys) {
                sortedArguments[key] = toolCall.arguments[key];
            }
            return `${toolCall.name} ${JSON.stringify(sortedArguments)}`;
        })
        .join('\n');
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(`\nreplay failed: ${error.message}`);
    } else {
        console.error('\nreplay failed:', error);
    }
    process.exitCode = 1;
});
