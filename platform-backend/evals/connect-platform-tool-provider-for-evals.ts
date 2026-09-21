import { connectInProcessMcpToolProvider } from '../src/mcp/client/connect-in-process-mcp-tool-provider.ts';
import type { McpToolProvider } from '../src/mcp/client/mcp-tool-provider.ts';
import { BuildAgentRegistry } from '../src/services/build-agents/build-agent-registry.ts';
import { DockerImageService } from '../src/services/docker/docker-image-service.ts';
import { DockerManagerService } from '../src/services/docker/docker-manager-service.ts';
import { ExternalDockerDaemon } from '../src/services/docker/external-docker-daemon.ts';
import { resolveDockerEndpoint } from '../src/services/docker/resolve-docker-endpoint.ts';

/**
 * The platform's MCP tools for a script run outside the server: real services
 * on `dockerHost`, linked to an MCP client in process. The daemon lifecycle is
 * the do-nothing one on purpose — a script must never boot or hold the WSL
 * distro — so with the daemon down a tool call simply reports "unreachable" in
 * band. Building the services opens no connection; only an executed tool does.
 */
export async function connectPlatformToolProviderForEvals(dockerHost: string): Promise<McpToolProvider> {
    const endpoint = resolveDockerEndpoint({ dockerHost: dockerHost });
    const daemon = new ExternalDockerDaemon();
    const images = new DockerImageService({
        daemon: daemon,
        socketPath: endpoint.socketPath,
        host: endpoint.host,
        port: endpoint.port,
    });
    const docker = new DockerManagerService({
        daemon: daemon,
        images: images,
        socketPath: endpoint.socketPath,
        host: endpoint.host,
        port: endpoint.port,
    });
    const buildAgents = new BuildAgentRegistry();
    return connectInProcessMcpToolProvider({ docker: docker, images: images, buildAgents: buildAgents });
}
