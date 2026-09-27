import type { LlmToolDefinition } from '../llm/interfaces.ts';
import type { AgentTool } from './interfaces.ts';

/** The tool as the model is told about it: name, description and argument schema — the agent's own flags stay behind. */
export function mapAgentToolToLlmToolDefinition(tool: AgentTool): LlmToolDefinition {
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}
