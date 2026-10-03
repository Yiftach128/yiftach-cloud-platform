import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ContainerDetails, ContainerService } from '../../../services/docker/interfaces.ts';
import { renderContainerActionResultText } from '../tool-results-utils/render-container-action-result-text.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * restart_container — stops a container when it runs, then starts it (the
 * POST /containers/:id/restart counterpart). Destructive: the service goes
 * down for the duration. Not idempotent: every call restarts again.
 */
export function registerRestartContainerTool(server: McpServer, docker: ContainerService): void {
    server.registerTool(
        'restart_container',
        {
            title: 'Restart container',
            description:
                'Restarts a running container: stops it, then starts it again, and reports the state it '
                + 'is in afterwards. For a container that is not running use start_container instead. '
                + 'Runs only after the user approves the call.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            await docker.restartContainer(args.container);
            const details: ContainerDetails = await docker.getContainerById(args.container);
            return toTextToolResult(renderContainerActionResultText('restarted', details));
        }),
    );
}
