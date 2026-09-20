import { Router } from 'express';

import type { McpHttpEndpoint } from '../mcp/mcp-http-endpoint.ts';

/**
 * ALL /mcp — the platform's MCP server (Streamable HTTP). `all` rather than
 * `post`: the protocol owns every method on its endpoint — requests arrive as
 * POST, and the MCP handler itself answers the GET/DELETE session operations
 * of older clients with the 405 their spec expects, which a POST-only route
 * would turn into a 404.
 */
export function allMcpRoute(mcp: McpHttpEndpoint): Router {
    return Router().all('/mcp', async (req, res) => {
        await mcp.handleRequest(req, res, req.body);
    });
}
