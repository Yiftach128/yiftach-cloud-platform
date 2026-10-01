/**
 * The adapter between the agent's `ToolProvider` and the MCP SDK's client:
 * how a tool's annotations become the agent's flags, and how both failure
 * surfaces come back in band. Linked to a small MCP server of this file's own
 * over the SDK's in-memory transport, because the cases need a tool the
 * platform's catalog never has — one without hints, one answering with a
 * non-text block.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { McpToolProvider } from '../../../src/mcp/client/mcp-tool-provider.ts';
import type { AgentTool, ToolCallOutcome } from '../../../src/services/ai-agent/interfaces.ts';

test('a tool without annotations reads as not read-only and destructive; a read-only tool is never destructive', async (t: TestContext) => {
    const server: McpServer = new McpServer({ name: 'test', version: '0' });
    server.registerTool('unhinted', { description: 'says nothing about itself' }, async () => ok());
    server.registerTool('reader', { annotations: { readOnlyHint: true, destructiveHint: true } }, async () => ok());
    server.registerTool('adder', { annotations: { readOnlyHint: false, destructiveHint: false } }, async () => ok());
    const provider: McpToolProvider = await connectProviderTo(server, t);

    const catalog: AgentTool[] = await provider.listTools();

    assert.deepEqual(catalog.map(flagsOf), [
        { name: 'unhinted', readOnly: false, destructive: true },
        { name: 'reader', readOnly: true, destructive: false },
        { name: 'adder', readOnly: false, destructive: false },
    ]);
});

test('a tool-level failure, a schema-rejected call and a protocol error (an unknown tool) all come back in band, never as a rejection', async (t: TestContext) => {
    const server: McpServer = new McpServer({ name: 'test', version: '0' });
    server.registerTool('failing', {}, async () => ({ content: [{ type: 'text', text: 'the thing broke' }], isError: true }));
    server.registerTool('counting', { inputSchema: z.object({ count: z.number() }) }, async () => ok());
    const provider: McpToolProvider = await connectProviderTo(server, t);

    const failed: ToolCallOutcome = await provider.callTool('failing', {}, signal());
    const rejected: ToolCallOutcome = await provider.callTool('counting', { count: 'many' }, signal());
    const unknown: ToolCallOutcome = await provider.callTool('no_such_tool', {}, signal());

    assert.deepEqual(failed, { text: 'the thing broke', isError: true });
    assert.equal(rejected.isError, true);
    assert.match(rejected.text, /count/);
    assert.equal(unknown.isError, true);
    assert.match(unknown.text, /^The call to no_such_tool was rejected: /);
});

test('a non-text content block is named in the text rather than dropped', async (t: TestContext) => {
    const server: McpServer = new McpServer({ name: 'test', version: '0' });
    server.registerTool('picture', {}, async () => ({
        content: [
            { type: 'text', text: 'see:' },
            { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        ],
    }));
    const provider: McpToolProvider = await connectProviderTo(server, t);

    const outcome: ToolCallOutcome = await provider.callTool('picture', {}, signal());

    assert.deepEqual(outcome, { text: 'see:\n[image content omitted]', isError: false });
});

/** The link `connect-in-process-mcp-tool-provider.ts` makes, for a server of the test's own; closed when the test ends. */
async function connectProviderTo(server: McpServer, t: TestContext): Promise<McpToolProvider> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client: Client = new Client({ name: 'test-client', version: '0' });
    await client.connect(clientTransport);
    const provider: McpToolProvider = new McpToolProvider(client);
    t.after((): Promise<void> => provider.close());
    return provider;
}

function ok(): CallToolResult {
    return { content: [{ type: 'text', text: 'ok' }] };
}

function signal(): AbortSignal {
    return new AbortController().signal;
}

function flagsOf(tool: AgentTool): { name: string; readOnly: boolean; destructive: boolean } {
    return { name: tool.name, readOnly: tool.readOnly, destructive: tool.destructive };
}
