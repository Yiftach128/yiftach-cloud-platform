import type { AgentRunStart, AgentRunTrace, AgentRunTracer } from './interfaces.ts';
import { NoOpAgentRunTrace } from './no-op-agent-run-trace.ts';

/**
 * The tracer of a loop that keeps no traces — the orchestrator's default, so
 * the evals and anyone else building the loop without one change nothing.
 */
export class NoOpAgentRunTracer implements AgentRunTracer {
    startRun(start: AgentRunStart): AgentRunTrace {
        return new NoOpAgentRunTrace();
    }
}
