import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { Container, ContainerState, GetContainersOptions } from '../../../services/docker/interfaces.ts';
import type { ContainerListToolResult, ContainerToolSummary } from '../interfaces.ts';
import { describeHiddenUnmanagedContainers } from '../tool-results-utils/describe-hidden-unmanaged-containers.ts';
import { isPlatformManagedContainer } from '../tool-results-utils/is-platform-managed-container.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';
import { toPortSummaries, toShortContainerId } from '../tool-results-utils/tool-result-value-formatters.ts';

/** The daemon's container states, spelled out for the input schema — the `ContainerState` union as a list. */
const CONTAINER_STATES = ['created', 'restarting', 'running', 'removing', 'paused', 'exited', 'dead'] as const;

/**
 * list_containers — the platform's containers as compact summaries (the
 * GET /containers counterpart). Like the services table, it shows the
 * containers the platform created unless asked for everything on the machine,
 * and it always says how many it left out: a model reading an empty list must
 * not conclude that nothing is running. The state filter runs in the daemon;
 * the managed split happens here, because the hidden count needs both halves.
 */
export function registerListContainersTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'list_containers',
        {
            title: 'List containers',
            description:
                'Lists the containers this platform created, running and stopped alike: name, image, '
                + 'state, status and published ports. Use it for any question about which containers '
                + "exist or are running, and to find a container's name. Other containers on the machine "
                + '(created with docker or compose) are left out and counted in hiddenUnmanagedCount; a '
                + 'container the user named that is not listed is one of them — call again with '
                + 'includeUnmanaged true.',
            inputSchema: z.object({
                state: z.enum(CONTAINER_STATES).optional()
                    .describe(
                        'Only containers in this state, e.g. "exited". Usually omitted: the unfiltered list shows '
                        + 'every container, running or stopped, which a health check or a name lookup needs.',
                    ),
                includeUnmanaged: z.boolean().optional()
                    .describe('true to include containers the platform did not create. Defaults to false.'),
            }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            // Typed against the service's union, so the schema cannot name a state the daemon does not have.
            const state: ContainerState | undefined = args.state;
            const options: GetContainersOptions = { all: true };
            if (state !== undefined) {
                options.filters = { status: [state] };
            }
            let includeUnmanaged: boolean;
            if (args.includeUnmanaged === undefined) {
                includeUnmanaged = false;
            } else {
                includeUnmanaged = args.includeUnmanaged;
            }

            const containers: Container[] = await docker.getContainers(options);
            let shown: Container[];
            if (includeUnmanaged) {
                shown = containers;
            } else {
                shown = containers.filter(isPlatformManagedContainer);
            }
            const hiddenUnmanagedCount: number = containers.length - shown.length;
            const result: ContainerListToolResult = {
                containers: shown.map(toSummary),
                hiddenUnmanagedCount: hiddenUnmanagedCount,
            };
            const note: string | undefined = describeHiddenUnmanagedContainers(hiddenUnmanagedCount);
            if (note !== undefined) {
                result.hiddenUnmanagedNote = note;
            }
            return toJsonToolResult(result);
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
        ports: toPortSummaries(container.ports),
        managed: isPlatformManagedContainer(container),
    };
}
