import type { IncomingMessage, ServerResponse } from 'node:http';

import { toNodeHandler } from '@modelcontextprotocol/node';
import type { NodeMcpRequestHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { McpHttpHandler } from '@modelcontextprotocol/server';

import { createPlatformMcpServer } from './create-platform-mcp-server.ts';
import type { PlatformMcpServices } from './interfaces.ts';

/**
 * The platform's MCP server over Streamable HTTP — what the `/mcp` route hands
 * its requests to, keeping the SDK out of `routes/`. Serving is per-request and
 * stateless: the SDK's handler builds a fresh server from the factory for every
 * exchange, speaks the 2026-07-28 protocol revision, and falls back to
 * stateless 2025-era serving for older clients (answering their GET/DELETE
 * session operations with 405 itself).
 *
 * The SDK's handler is deliberately validation-free and expects Host/Origin
 * checks in front of it — here that is `middleware/host-check.ts`, mounted
 * app-wide before any route.
 */
export class McpHttpEndpoint {
    private readonly handler: McpHttpHandler;
    private readonly nodeHandler: NodeMcpRequestHandler;

    constructor(services: PlatformMcpServices) {
        this.handler = createMcpHandler(() => createPlatformMcpServer(services), {
            onerror: (error: Error) => console.warn('mcp request failed:', error.message),
        });
        this.nodeHandler = toNodeHandler(this.handler, {
            onerror: (error: Error) => console.warn('mcp request failed:', error.message),
        });
    }

    /** Serves one HTTP request. `parsedBody` is `req.body` from `express.json()`, which has already drained the stream. */
    async handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void> {
        await this.nodeHandler(req, res, parsedBody);
    }

    /** Aborts in-flight exchanges and open subscription streams, so shutdown is not held up by them. */
    async close(): Promise<void> {
        await this.handler.close();
    }
}
