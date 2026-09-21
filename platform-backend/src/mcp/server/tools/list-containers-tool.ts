import type { McpServer } from '@modelcontextprotocol/server';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { Container } from '../../../services/docker/interfaces.ts';
import type { ContainerToolSummary } from '../interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';
import { toShortContainerId } from '../tool-results-utils/tool-result-value-formatters.ts';

const MANAGED_LABEL = 'cloudplatform.managed';

/** list_containers — every container on the daemon, as compact summaries (the GET /containers counterpart). */
export function registerListContainersTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'list_containers',
        {
            title: 'List containers',
            description:
                'Lists every Docker container on this machine, running and stopped: name, image, state, '
                + 'status, published ports, and whether the platform created it. Start here to find a '
                + "container's name.",
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => runToolWithErrorMapping(async () => {
            const containers: Container[] = await docker.getContainers();
            return toJsonToolResult(containers.map(toSummary));
        }),
    );
}

function toSummary(container: Container): ContainerToolSummary {
    return {
        id: toShortContainerId(container.id),
        name: container.name,
        image: container.image,
        state: container.state,
        status: container.status,
        ports: container.ports,
        managed: container.labels[MANAGED_LABEL] === 'true',
    };
}
