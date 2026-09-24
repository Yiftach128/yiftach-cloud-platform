import { McpServer } from '@modelcontextprotocol/server';

import type { PlatformMcpServices } from './interfaces.ts';
import { registerGetContainerLogsTool } from './tools/get-container-logs-tool.ts';
import { registerGetContainerStatsTool } from './tools/get-container-stats-tool.ts';
import { registerGetContainerTool } from './tools/get-container-tool.ts';
import { registerGetImageTool } from './tools/get-image-tool.ts';
import { registerListBuildAgentsTool } from './tools/list-build-agents-tool.ts';
import { registerListContainersTool } from './tools/list-containers-tool.ts';
import { registerListImagesTool } from './tools/list-images-tool.ts';

const SERVER_NAME = 'yiftach-cloud-platform';
const SERVER_VERSION = '0.1.0';

/** Sent to every client; MCP clients typically hand it to their model as usage guidance. */
const SERVER_INSTRUCTIONS =
    'Read-only tools for inspecting Yiftach Cloud Platform, a self-hosted Docker control panel: '
    + 'its containers, the images it built from GitHub repositories, and its build agents. '
    + 'list_containers and get_container_stats show the containers the platform created; other '
    + 'containers on the machine are only counted (hiddenUnmanagedCount) unless includeUnmanaged is true. '
    + 'Container names come from list_containers; image ids from list_images. '
    + 'To diagnose a container, combine get_container (exit code, health, restarts) with get_container_logs.';

/**
 * Builds a fresh MCP server with every platform tool registered. A factory
 * rather than a shared instance because an MCP server instance binds to one
 * transport: the HTTP endpoint needs one per request, and each further
 * transport needs its own. Instances are cheap — the tools only hold references
 * to the long-lived platform services.
 */
export function createPlatformMcpServer(services: PlatformMcpServices): McpServer {
    const server: McpServer = new McpServer(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { instructions: SERVER_INSTRUCTIONS },
    );
    registerListContainersTool(server, services.docker);
    registerGetContainerTool(server, services.docker);
    registerGetContainerLogsTool(server, services.docker);
    registerGetContainerStatsTool(server, services.docker);
    registerListImagesTool(server, services.images);
    registerGetImageTool(server, services.images);
    registerListBuildAgentsTool(server, services.buildAgents);
    return server;
}
