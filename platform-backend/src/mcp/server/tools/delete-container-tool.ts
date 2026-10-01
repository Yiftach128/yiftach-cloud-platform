import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ContainerService } from '../../../services/docker/interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * delete_container — removes a stopped container (the DELETE /containers/:id
 * counterpart). Neither force nor volume removal is ever passed: a running
 * container is refused by the daemon itself, so removing one takes an explicit
 * stop_container first — a second call the user approves separately — and a
 * named volume outlives its container as it does on the command line.
 */
export function registerDeleteContainerTool(server: McpServer, docker: ContainerService): void {
    server.registerTool(
        'delete_container',
        {
            title: 'Delete container',
            description:
                'Deletes a container. Call it directly when asked to delete one. Docker refuses to delete '
                + 'a running container; only when this tool reports that refusal, tell the user the '
                + 'container is running and ask whether to stop it first — and only after they agree call '
                + 'stop_container and then delete_container again. Runs only after the user approves '
                + 'the call.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            await docker.deleteContainer(args.container);
            return toTextToolResult(`Container "${args.container}" deleted.`);
        }),
    );
}
