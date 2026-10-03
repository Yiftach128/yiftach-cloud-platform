import { createWriteStream, type WriteStream } from 'node:fs';
import type { AgentEvent, AgentRunResult, AgentRunTrace, TracedModelCall } from '../ai-agent/interfaces.ts';
import type { ChatTraceRecord, ChatTraceRunStartRecord } from './interfaces.ts';

/**
 * The trace of one run as a JSON-lines file: each record is serialized and
 * appended the moment it arrives, so a run that dies mid-way still leaves the
 * calls made so far. Serializing at once also matters because the loop hands
 * over its live message list, which grows after each call.
 *
 * Never throws: a failed write is reported once on the console and the rest of
 * the run goes unrecorded — a trace must not fail the chat it records.
 */
export class JsonLinesChatTrace implements AgentRunTrace {
    private readonly filePath: string;
    private readonly startedAt: Date;
    private readonly stream: WriteStream;
    private broken: boolean;

    constructor(filePath: string, startedAt: Date, header: ChatTraceRunStartRecord) {
        this.filePath = filePath;
        this.startedAt = startedAt;
        this.broken = false;
        this.stream = createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
        // Without a listener a stream error is an uncaught exception that takes the server down.
        this.stream.on('error', (error: Error): void => {
            this.giveUp(error);
        });
        this.writeRecord(header);
    }

    recordModelCall(call: TracedModelCall): void {
        this.writeRecord({
            type: 'model_call',
            callNumber: call.callNumber,
            endedAt: new Date().toISOString(),
            durationMs: call.durationMs,
            toolsOffered: call.request.tools.length > 0,
            messages: call.request.messages,
            reply: call.reply,
            aborted: call.aborted,
        });
    }

    recordEvent(event: AgentEvent): void {
        if (event.type === 'delta') {
            return;
        }
        this.writeRecord({ type: 'event', at: new Date().toISOString(), event: event });
    }

    finishRun(result: AgentRunResult): void {
        const endedAt: Date = new Date();
        this.writeRecord({
            type: 'run_end',
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - this.startedAt.getTime(),
            stopReason: result.stopReason,
            modelCalls: result.modelCalls,
            peakPromptTokens: result.peakPromptTokens,
            toolCalls: result.toolCalls,
        });
        this.stream.end();
    }

    failRun(error: unknown): void {
        const endedAt: Date = new Date();
        let errorName: string;
        let message: string;
        if (error instanceof Error) {
            errorName = error.name;
            message = error.message;
        } else {
            errorName = 'unknown';
            message = String(error);
        }
        this.writeRecord({
            type: 'run_failed',
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - this.startedAt.getTime(),
            errorName: errorName,
            message: message,
        });
        this.stream.end();
    }

    private writeRecord(record: ChatTraceRecord): void {
        if (this.broken) {
            return;
        }
        try {
            this.stream.write(`${JSON.stringify(record)}\n`);
        } catch (error) {
            this.giveUp(error);
        }
    }

    private giveUp(error: unknown): void {
        if (this.broken) {
            return;
        }
        this.broken = true;
        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else {
            message = String(error);
        }
        console.error(`chat trace: writing ${this.filePath} failed, the rest of this run is not traced: ${message}`);
    }
}
