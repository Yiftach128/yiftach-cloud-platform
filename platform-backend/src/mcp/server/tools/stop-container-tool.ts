import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ContainerDetails, ContainerService } from '../../../services/docker/interfaces.ts';
import { renderContainerActionResultText } from '../tool-results-utils/render-container-action-result-text.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * stop_container — stops a running container (the POST /containers/:id/stop
 * counterpart, with the daemon's default grace period). Destructive: whatever
 * the container serves goes down. Idempotent: stopping a stopped container
 * changes nothing.
 */
export function registerStopContainerTool(server: McpServer, docker: ContainerService): void {
    server.registerTool(
        'stop_container',
        {
            title: 'Stop container',
            description:
                'Stops a running container (graceful stop, then kill after 10 seconds) and reports the '
                + 'state it is in afterwards. Runs only after the user approves the call.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            await docker.stopContainer(args.container);
            const details: ContainerDetails = await docker.getContainerById(args.container);
            return toTextToolResult(renderContainerActionResultText('stopped', details));
        }),
    );
}
