import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ContainerDetails, ContainerService } from '../../../services/docker/interfaces.ts';
import { renderContainerActionResultText } from '../tool-results-utils/render-container-action-result-text.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * start_container — starts a stopped container (the POST /containers/:id/start
 * counterpart). Not destructive: it only adds a running process. Idempotent:
 * starting a running container changes nothing.
 */
export function registerStartContainerTool(server: McpServer, docker: ContainerService): void {
    server.registerTool(
        'start_container',
        {
            title: 'Start container',
            description:
                'Starts a stopped (exited or created) container and reports the state it is in '
                + 'afterwards.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            await docker.startContainer(args.container);
            const details: ContainerDetails = await docker.getContainerById(args.container);
            return toTextToolResult(renderContainerActionResultText('started', details));
        }),
    );
}
