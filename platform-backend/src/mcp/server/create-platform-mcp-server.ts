import { McpServer } from '@modelcontextprotocol/server';

import type { PlatformMcpServices } from './interfaces.ts';
import { registerCreateContainerTool } from './tools/create-container-tool.ts';
import { registerDeleteContainerTool } from './tools/delete-container-tool.ts';
import { registerDeleteImageTool } from './tools/delete-image-tool.ts';
import { registerGetBuildTool } from './tools/get-build-tool.ts';
import { registerGetContainerLogsTool } from './tools/get-container-logs-tool.ts';
import { registerGetContainerStatsTool } from './tools/get-container-stats-tool.ts';
import { registerGetContainerTool } from './tools/get-container-tool.ts';
import { registerGetImageTool } from './tools/get-image-tool.ts';
import { registerListBuildAgentsTool } from './tools/list-build-agents-tool.ts';
import { registerListContainersTool } from './tools/list-containers-tool.ts';
import { registerListImagesTool } from './tools/list-images-tool.ts';
import { registerRestartContainerTool } from './tools/restart-container-tool.ts';
import { registerStartBuildTool } from './tools/start-build-tool.ts';
import { registerStartContainerTool } from './tools/start-container-tool.ts';
import { registerStopContainerTool } from './tools/stop-container-tool.ts';

const SERVER_NAME = 'yiftach-cloud-platform';
const SERVER_VERSION = '0.2.0';

/** Sent to every client; MCP clients typically hand it to their model as usage guidance. */
const SERVER_INSTRUCTIONS =
    'Tools for operating Yiftach Cloud Platform, a self-hosted Docker control panel: its containers, '
    + 'the images it built from GitHub repositories, its build jobs and its build agents. '
    + 'Tools that change something (start, stop, restart, create or delete a container, delete an image, '
    + 'start a build) are used when the user asks for the change, never on your own initiative; those that '
    + 'stop, restart or delete run only after the user has approved the call. Report only what a result confirms. '
    + 'list_containers and get_container_stats show the containers the platform created; other '
    + 'containers on the machine are only counted (hiddenUnmanagedCount) unless includeUnmanaged is true. '
    + 'Container names come from list_containers; image ids from list_images. '
    + 'To diagnose a container, combine get_container (exit code, health, restarts) with get_container_logs. '
    + 'To delete a container call delete_container; Docker refuses while the container is running, and only '
    + 'when the tool reports that refusal tell the user and ask whether to stop it first.';

/**
 * Builds a fresh MCP server with every platform tool registered. A factory
 * rather than a shared instance because an MCP server instance binds to one
 * transport: the HTTP endpoint needs one per request, and each further
 * transport needs its own. Instances are cheap — the tools only hold references
 * to the long-lived platform services.
 *
 * One flat catalog: which tools read and which change things is said by their
 * annotations (`readOnlyHint`, `destructiveHint`), the one place the agent loop
 * and its approval gate consult. The two blocks below only make the split
 * visible to a reader.
 */
export function createPlatformMcpServer(services: PlatformMcpServices): McpServer {
    const server: McpServer = new McpServer(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { instructions: SERVER_INSTRUCTIONS },
    );

    // Read-only tools.
    registerListContainersTool(server, services.docker);
    registerGetContainerTool(server, services.docker);
    registerGetContainerLogsTool(server, services.docker);
    registerGetContainerStatsTool(server, services.docker);
    registerListImagesTool(server, services.images);
    registerGetImageTool(server, services.images);
    registerGetBuildTool(server, services.builds);
    registerListBuildAgentsTool(server, services.buildAgents);

    // Tools that change something — the destructive ones wait for the user's approval.
    registerStartContainerTool(server, services.docker);
    registerStopContainerTool(server, services.docker);
    registerRestartContainerTool(server, services.docker);
    registerDeleteContainerTool(server, services.docker);
    registerCreateContainerTool(server, services.docker);
    registerDeleteImageTool(server, services.images);
    registerStartBuildTool(server, services.builds);
    return server;
}
