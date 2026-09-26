import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { ContainerDetails } from '../../../services/docker/interfaces.ts';
import { mapContainerDetailsToToolView } from '../tool-results-utils/map-container-details-to-tool-view.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * get_container — one container's details, cut down to what a diagnosis needs
 * (the GET /containers/:id counterpart; the shape is `ContainerToolDetails`,
 * which says what was dropped and why).
 */
export function registerGetContainerTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'get_container',
        {
            title: 'Get container details',
            description:
                'Returns the details of one container that matter for a diagnosis: state (exit code, OOM '
                + 'kill, error, health, restart count), the command it runs, ports, environment variable '
                + 'names, labels, restart policy, mounts, networks and resource limits. Combine it with '
                + 'get_container_logs to find out why a container is down.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const details: ContainerDetails = await docker.getContainerById(args.container);
            return toJsonToolResult(mapContainerDetailsToToolView(details));
        }),
    );
}
