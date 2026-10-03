import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ContainerDetails, ContainerService, CreateContainerOptions } from '../../../services/docker/interfaces.ts';
import { parseCreateContainerRequest } from '../../../services/validation/parse-create-container-request.ts';
import { mapContainerDetailsToToolView } from '../tool-results-utils/map-container-details-to-tool-view.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * create_container — creates and starts a container (the POST /containers
 * counterpart). The zod schema describes the arguments to the model; the
 * platform's own request parser then applies the same field rules as the REST
 * route, so a name or port the API would refuse is refused here too, in band.
 * Answers with the new container's `ContainerToolDetails`, the get_container
 * view.
 */
export function registerCreateContainerTool(server: McpServer, docker: ContainerService): void {
    server.registerTool(
        'create_container',
        {
            title: 'Create container',
            description:
                'Creates and starts a container from an image reference, publishing the given TCP ports '
                + 'and setting the given environment variables. The image is pulled from its registry when '
                + 'it is not present locally, which can take minutes. Ask the user for the name and the '
                + 'image when they did not give them; do not invent ports.',
            inputSchema: z.object({
                name: z.string().min(1)
                    .describe('Name for the new container: 1-63 letters, digits, "_", "." or "-", starting with a letter or digit.'),
                image: z.string().min(1)
                    .describe('Image reference, e.g. "nginx:1.27" or "redis:7".'),
                ports: z.array(z.object({
                    // Coerced: small models often send numbers as strings ("8080").
                    hostPort: z.coerce.number().int().describe('Port opened on the host machine.'),
                    containerPort: z.coerce.number().int().describe('Port the service listens on inside the container.'),
                })).optional()
                    .describe('TCP ports to publish, host port to container port. Omit to publish nothing.'),
                env: z.record(z.string(), z.string()).optional()
                    .describe('Environment variables by name, e.g. {"POSTGRES_PASSWORD": "secret"}. Omit for none.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const options: CreateContainerOptions = parseCreateContainerRequest(args);
            const details: ContainerDetails = await docker.createContainer(options);
            return toJsonToolResult(mapContainerDetailsToToolView(details));
        }),
    );
}
