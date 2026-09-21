import type { McpServer } from '@modelcontextprotocol/server';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { Container, ContainerStats, ContainerStatsMap } from '../../../services/docker/interfaces.ts';
import type { ContainerStatsToolRow } from '../interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';
import { roundToTwoDecimals, toMebibytes } from '../tool-results-utils/tool-result-value-formatters.ts';

/**
 * get_container_stats — a CPU/memory sample per running container (the
 * GET /containers/stats counterpart). The service keys its samples by full
 * container id; the tool joins them to container names, because a model asked
 * "what is eating memory?" must answer with a name, and matching 64-character
 * ids across two tool results is exactly what small models get wrong.
 */
export function registerGetContainerStatsTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'get_container_stats',
        {
            title: 'Get container resource usage',
            description:
                'Returns the current CPU and memory usage of every running container. Stopped '
                + 'containers do not appear. cpuPercent 100 means one full CPU core.',
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => runToolWithErrorMapping(async () => {
            const running: Container[] = await docker.getContainers({ all: false });
            const stats: ContainerStatsMap = await docker.getContainersStats();
            const rows: ContainerStatsToolRow[] = [];
            for (const container of running) {
                // Absent when the container stopped between the two calls.
                const sample: ContainerStats | undefined = stats[container.id];
                if (sample !== undefined) {
                    rows.push(toRow(container.name, sample));
                }
            }
            return toJsonToolResult(rows);
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
