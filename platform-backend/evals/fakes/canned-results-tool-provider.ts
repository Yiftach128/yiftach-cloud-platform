import type { AgentTool, ToolCallOutcome, ToolProvider } from '../../src/services/ai-agent/interfaces.ts';
import { cannedPlatformToolResult } from './canned-platform-tool-results.ts';
import type { CannedPlatformCaseMemory } from './interfaces.ts';

/**
 * A `ToolProvider` for reproducible checks: the tool list and the usage
 * instructions are the real ones (from `catalog`, the platform's MCP server),
 * so the model chooses among exactly what production offers — but every call is
 * answered from canned data instead of being executed. One instance per case:
 * it holds what the canned platform remembers within a case (a stop, so a
 * later delete succeeds), and a fresh instance is how the next case starts
 * from the same platform.
 */
export class CannedResultsToolProvider implements ToolProvider {
    private readonly catalog: ToolProvider;
    private readonly caseMemory: CannedPlatformCaseMemory;

    constructor(catalog: ToolProvider) {
        this.catalog = catalog;
        this.caseMemory = { stoppedContainerNames: new Set<string>() };
    }

    async listTools(): Promise<AgentTool[]> {
        return this.catalog.listTools();
    }

    getUsageInstructions(): string {
        return this.catalog.getUsageInstructions();
    }

    async callTool(name: string, toolArguments: Record<string, unknown>, _signal: AbortSignal): Promise<ToolCallOutcome> {
        return cannedPlatformToolResult(name, toolArguments, this.caseMemory);
    }
}
