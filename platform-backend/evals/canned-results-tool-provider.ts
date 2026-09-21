import type { AgentTool, ToolCallOutcome, ToolProvider } from '../src/services/ai-agent/interfaces.ts';
import { cannedPlatformToolResult } from './canned-platform-tool-results.ts';

/**
 * A `ToolProvider` for reproducible checks: the tool list and the usage
 * instructions are the real ones (from `catalog`, the platform's MCP server),
 * so the model chooses among exactly what production offers — but every call is
 * answered from canned data instead of being executed.
 */
export class CannedResultsToolProvider implements ToolProvider {
    private readonly catalog: ToolProvider;

    constructor(catalog: ToolProvider) {
        this.catalog = catalog;
    }

    async listTools(): Promise<AgentTool[]> {
        return this.catalog.listTools();
    }

    getUsageInstructions(): string {
        return this.catalog.getUsageInstructions();
    }

    async callTool(name: string, toolArguments: Record<string, unknown>, _signal: AbortSignal): Promise<ToolCallOutcome> {
        return cannedPlatformToolResult(name, toolArguments);
    }
}
