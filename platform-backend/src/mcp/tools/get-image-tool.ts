import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerImageService } from '../../services/docker/docker-image-service.ts';
import type { ImageDetails } from '../../services/docker/interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * get_image — one platform-built image's details (the GET /images/:id
 * counterpart). Like the route, it serves only images carrying the managed
 * label; anything else comes back as a tool error.
 */
export function registerGetImageTool(server: McpServer, images: DockerImageService): void {
    server.registerTool(
        'get_image',
        {
            title: 'Get image details',
            description:
                'Returns details of one platform-built image: tags, size, the ports it EXPOSEs, and '
                + 'its build provenance labels (cloudplatform.repo-url, .git-ref, .commit, .build-job-id).',
            inputSchema: z.object({
                image: z.string().min(1).describe('Image id or tag, as list_images reports it.'),
            }),
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const details: ImageDetails = await images.getManagedImageDetails(args.image);
            return toJsonToolResult(details);
        }),
    );
}
