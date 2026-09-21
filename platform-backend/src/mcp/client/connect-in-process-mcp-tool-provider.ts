import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';

import { createPlatformMcpServer } from '../server/create-platform-mcp-server.ts';
import type { PlatformMcpServices } from '../server/interfaces.ts';
import { McpToolProvider } from './mcp-tool-provider.ts';

const CLIENT_NAME = 'yiftach-cloud-platform-ai-agent';
const CLIENT_VERSION = '0.1.0';

/**
 * Connects an MCP client to the platform's own MCP server inside this process:
 * a fresh server from the factory (a server binds to one transport) on one end
 * of a linked in-memory transport pair, the client on the other. The built-in
 * agent thereby uses exactly the tool catalog external MCP clients get at
 * `/mcp` — same schemas, same validation, same error mapping — without an HTTP
 * hop. Close the returned provider to end the link.
 */
export async function connectInProcessMcpToolProvider(services: PlatformMcpServices): Promise<McpToolProvider> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const server: McpServer = createPlatformMcpServer(services);
    await server.connect(serverTransport);

    const client: Client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
    await client.connect(clientTransport);

    return new McpToolProvider(client);
}
