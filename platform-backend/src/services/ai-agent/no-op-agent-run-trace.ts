import type { AgentEvent, AgentRunResult, AgentRunTrace, TracedModelCall } from './interfaces.ts';

/** The trace of a run nobody records: every record is dropped. */
export class NoOpAgentRunTrace implements AgentRunTrace {
    recordModelCall(call: TracedModelCall): void {
        // nothing is kept
    }

    recordEvent(event: AgentEvent): void {
        // nothing is kept
    }

    finishRun(result: AgentRunResult): void {
        // nothing is kept
    }

    failRun(error: unknown): void {
        // nothing is kept
    }
}
