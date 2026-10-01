import type { LlmToolCall } from '../../../../src/services/llm/interfaces.ts';
import type { AgentTool, ToolCallOutcome, ToolProvider } from '../../../../src/services/ai-agent/interfaces.ts';

/**
 * The tests' `ToolProvider`: offers the catalog it is given, answers each tool
 * with the outcome the test set for it, and keeps every call, so a test reads
 * which tools the loop ran and with what. An outcome may be a promise the test
 * resolves later, to decide in which order calls finish. `failWith` makes a
 * tool throw, as a tool bug would.
 */
export class RecordingToolProvider implements ToolProvider {
    /** Every call the loop made, in the order it made them. */
    readonly calls: LlmToolCall[] = [];
    private readonly tools: AgentTool[];
    private readonly outcomes: Map<string, ToolCallOutcome | Promise<ToolCallOutcome>> = new Map();
    private readonly failures: Map<string, Error> = new Map();

    constructor(tools: AgentTool[]) {
        this.tools = tools;
    }

    answerWith(toolName: string, outcome: ToolCallOutcome | Promise<ToolCallOutcome>): void {
        this.outcomes.set(toolName, outcome);
    }

    failWith(toolName: string, failure: Error): void {
        this.failures.set(toolName, failure);
    }

    async listTools(): Promise<AgentTool[]> {
        return this.tools.slice();
    }

    getUsageInstructions(): string {
        return '';
    }

    async callTool(name: string, toolArguments: Record<string, unknown>, _signal: AbortSignal): Promise<ToolCallOutcome> {
        this.calls.push({ name: name, arguments: toolArguments });
        const failure: Error | undefined = this.failures.get(name);
        if (failure !== undefined) {
            throw failure;
        }
        const outcome: ToolCallOutcome | Promise<ToolCallOutcome> | undefined = this.outcomes.get(name);
        if (outcome === undefined) {
            throw new Error(`RecordingToolProvider: no outcome set for tool "${name}"`);
        }
        return outcome;
    }
}
