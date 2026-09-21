import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { ContainerDetails } from '../../../services/docker/interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * get_container — one container's inspect details (the GET /containers/:id
 * counterpart). Environment variable *values* are redacted: they routinely
 * hold secrets (database passwords, tokens), and a tool result ends up in the
 * context of whatever model the MCP client runs — possibly a hosted one. The
 * REST API still serves them to the platform's own UI.
 */
export function registerGetContainerTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'get_container',
        {
            title: 'Get container details',
            description:
                'Returns the full inspect details of one container: state (exit code, OOM kill, error, '
                + 'health), restart count, configuration, resource limits, mounts, ports and networks. '
                + 'Environment variable values are redacted.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const details: ContainerDetails = await docker.getContainerById(args.container);
            // A private deep copy, so the redaction never touches what the service returned.
            const redacted: ContainerDetails = structuredClone(details);
            redacted.config.env = redacted.config.env.map(redactEnvValue);
            return toJsonToolResult(redacted);
        }),
    );
}

/** "KEY=value" → "KEY=<redacted>"; an entry without "=" has no value to hide. */
function redactEnvValue(entry: string): string {
    const separator: number = entry.indexOf('=');
    if (separator === -1) {
        return entry;
    }
    return `${entry.substring(0, separator)}=<redacted>`;
}
