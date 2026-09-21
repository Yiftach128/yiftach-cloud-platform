import type { CallToolResult, Client, ListToolsResult, Tool } from '@modelcontextprotocol/client';

import type { AgentTool, ToolCallOutcome, ToolProvider } from '../../services/ai-agent/interfaces.ts';

/**
 * The AI agent's tools, served by an MCP server — the adapter between the
 * agent's own `ToolProvider` contract and the MCP SDK's `Client`, so the agent
 * never sees the SDK (it stays quarantined in `src/mcp/`). Takes a client that
 * is already connected: which server it talks to, and over which transport, is
 * the caller's business (`connect-in-process-mcp-tool-provider.ts` today).
 */
export class McpToolProvider implements ToolProvider {
    private readonly client: Client;

    constructor(connectedClient: Client) {
        this.client = connectedClient;
    }

    async listTools(): Promise<AgentTool[]> {
        const result: ListToolsResult = await this.client.listTools();
        return result.tools.map(toAgentTool);
    }

    /** The server's `instructions` — MCP's own channel for "how to use these tools together". */
    getUsageInstructions(): string {
        const instructions: string | undefined = this.client.getInstructions();
        if (instructions === undefined) {
            return '';
        }
        return instructions;
    }

    /**
     * MCP has two failure surfaces and both come back in band, because the
     * model can act on either: a tool-level failure (`isError` on the result —
     * what `run-tool-with-error-mapping.ts` produces) and a protocol-level one
     * (a thrown error — e.g. arguments the server's input schema rejected).
     */
    async callTool(name: string, toolArguments: Record<string, unknown>, signal: AbortSignal): Promise<ToolCallOutcome> {
        try {
            const result: CallToolResult = await this.client.callTool(
                { name: name, arguments: toolArguments },
                { signal: signal },
            );
            return { text: renderContentAsText(result), isError: result.isError === true };
        } catch (error) {
            let message: string;
            if (error instanceof Error) {
                message = error.message;
            } else {
                message = String(error);
            }
            return { text: `The call to ${name} was rejected: ${message}`, isError: true };
        }
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}

function toAgentTool(tool: Tool): AgentTool {
    let description: string;
    if (tool.description === undefined) {
        description = '';
    } else {
        description = tool.description;
    }
    // Absent means "not known to be read-only": the cautious reading of an MCP hint.
    let readOnly: boolean;
    if (tool.annotations === undefined) {
        readOnly = false;
    } else {
        readOnly = tool.annotations.readOnlyHint === true;
    }
    return {
        name: tool.name,
        description: description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        readOnly: readOnly,
    };
}

/** The platform's tools answer in text blocks; any other block kind is named rather than silently dropped. */
function renderContentAsText(result: CallToolResult): string {
    const parts: string[] = [];
    for (const block of result.content) {
        if (block.type === 'text') {
            parts.push(block.text);
        } else {
            parts.push(`[${block.type} content omitted]`);
        }
    }
    return parts.join('\n');
}
