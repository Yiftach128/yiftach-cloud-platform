import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRunStart, AgentRunTrace, AgentRunTracer } from '../ai-agent/interfaces.ts';
import { NoOpAgentRunTrace } from '../ai-agent/no-op-agent-run-trace.ts';
import type { ChatTracerOptions, ChatTraceRunStartRecord } from './interfaces.ts';
import { JsonLinesChatTrace } from './json-lines-chat-trace.ts';

/**
 * Keeps one JSON-lines trace file per run in a folder, named by the run's start
 * time and a short random id, and says on the console where each run's trace
 * went — the line to look for after a reply that went wrong. A folder that
 * cannot be created costs that run its trace, not its answer.
 */
export class JsonLinesChatTracer implements AgentRunTracer {
    private readonly directory: string;
    private readonly model: string;
    private readonly contextTokens: number;

    constructor(options: ChatTracerOptions) {
        this.directory = options.directory;
        this.model = options.model;
        this.contextTokens = options.contextTokens;
    }

    startRun(start: AgentRunStart): AgentRunTrace {
        const startedAt: Date = new Date();
        const runId: string = randomUUID().substring(0, 8);
        const filePath: string = join(this.directory, `${toFileNameTimestamp(startedAt)}-${runId}.jsonl`);
        try {
            mkdirSync(this.directory, { recursive: true });
        } catch (error) {
            console.error(`chat trace: cannot create ${this.directory}, run ${runId} is not traced:`, error);
            return new NoOpAgentRunTrace();
        }
        const header: ChatTraceRunStartRecord = {
            type: 'run_start',
            runId: runId,
            startedAt: startedAt.toISOString(),
            model: this.model,
            contextTokens: this.contextTokens,
            autoApproveToolCalls: start.request.autoApproveToolCalls,
            turns: start.request.turns,
            tools: start.tools,
        };
        console.log(`chat trace: ${filePath}`);
        return new JsonLinesChatTrace(filePath, startedAt, header);
    }
}

/** `2026-09-26T14:32:05.123Z` becomes `2026-09-26T14-32-05-123Z`: a Windows file name cannot carry a colon. */
function toFileNameTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
}
