import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { Container, ContainerStats, ContainerStatsMap } from '../../../services/docker/interfaces.ts';
import type { ContainerStatsToolResult, ContainerStatsToolRow } from '../interfaces.ts';
import { isPlatformManagedContainer } from '../tool-results-utils/is-platform-managed-container.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';
import { roundToTwoDecimals, toMebibytes } from '../tool-results-utils/tool-result-value-formatters.ts';

/**
 * get_container_stats — a CPU/memory sample per running container (the
 * GET /containers/stats counterpart). The service keys its samples by full
 * container id; the tool joins them to container names, because a model asked
 * "what is eating memory?" must answer with a name, and matching 64-character
 * ids across two tool results is exactly what small models get wrong. It
 * shows the platform's own containers by default, like list_containers, so a
 * container never appears in one tool's answer and not the other's.
 */
export function registerGetContainerStatsTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'get_container_stats',
        {
            title: 'Get container resource usage',
            description:
                'Returns the current CPU and memory usage of the running containers this platform '
                + 'created. Stopped containers do not appear. Other running containers on the machine '
                + 'are counted in hiddenUnmanagedCount; set includeUnmanaged to true to include them. '
                + 'cpuPercent 100 means one full CPU core.',
            inputSchema: z.object({
                includeUnmanaged: z.boolean().optional()
                    .describe('true to include containers the platform did not create. Defaults to false.'),
            }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            let includeUnmanaged: boolean;
            if (args.includeUnmanaged === undefined) {
                includeUnmanaged = false;
            } else {
                includeUnmanaged = args.includeUnmanaged;
            }

            const running: Container[] = await docker.getContainers({ all: false });
            let shown: Container[];
            if (includeUnmanaged) {
                shown = running;
            } else {
                shown = running.filter(isPlatformManagedContainer);
            }
            const stats: ContainerStatsMap = await docker.getContainersStats();
            const rows: ContainerStatsToolRow[] = [];
            for (const container of shown) {
                // Absent when the container stopped between the two calls.
                const sample: ContainerStats | undefined = stats[container.id];
                if (sample !== undefined) {
                    rows.push(toRow(container.name, sample));
                }
            }
            const result: ContainerStatsToolResult = {
                containers: rows,
                hiddenUnmanagedCount: running.length - shown.length,
            };
            return toJsonToolResult(result);
        }),
    );
}

function toRow(name: string, sample: ContainerStats): ContainerStatsToolRow {
    let memoryPercent: number;
    if (sample.memoryLimitBytes > 0) {
        memoryPercent = roundToTwoDecimals((sample.memoryUsedBytes / sample.memoryLimitBytes) * 100);
    } else {
        memoryPercent = 0;
    }
    return {
        name: name,
        cpuPercent: roundToTwoDecimals(sample.cpuPercent),
        memoryUsedMiB: toMebibytes(sample.memoryUsedBytes),
        memoryLimitMiB: toMebibytes(sample.memoryLimitBytes),
        memoryPercent: memoryPercent,
    };
}
