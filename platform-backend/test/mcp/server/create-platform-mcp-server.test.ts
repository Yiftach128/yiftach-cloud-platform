/**
 * The catalog the platform's MCP server offers, read through the in-process
 * client as the agent reads it: the fifteen tools, and the annotations the
 * agent loop and its approval gate act on — which tools only read, and which
 * of the rest destroy something and so wait for the user.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { AgentTool } from '../../../src/services/ai-agent/interfaces.ts';
import { PlatformMcpToolsWithFakes } from '../platform-mcp-tools-with-fakes.ts';

test('the catalog has the fifteen tools; readers are read-only, stop, restart and the deletes are destructive, start, create and build only add', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    const catalog: AgentTool[] = await tools.provider.listTools();

    const kindByName: Record<string, string> = {};
    for (const tool of catalog) {
        kindByName[tool.name] = kindOf(tool);
    }
    assert.deepEqual(kindByName, {
        list_containers: 'reads',
        get_container: 'reads',
        get_container_logs: 'reads',
        get_container_stats: 'reads',
        list_images: 'reads',
        get_image: 'reads',
        get_build: 'reads',
        list_build_agents: 'reads',
        start_container: 'adds',
        stop_container: 'destroys',
        restart_container: 'destroys',
        delete_container: 'destroys',
        create_container: 'adds',
        delete_image: 'destroys',
        start_build: 'adds',
    });
});

function kindOf(tool: AgentTool): string {
    if (tool.readOnly) {
        return 'reads';
    } else if (tool.destructive) {
        return 'destroys';
    } else {
        return 'adds';
    }
}
