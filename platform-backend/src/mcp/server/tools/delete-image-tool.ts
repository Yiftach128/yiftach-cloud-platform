import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ImageService } from '../../../services/docker/interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * delete_image — removes a platform-built image (the DELETE /images/:id
 * counterpart). Like the route it serves only images carrying the managed
 * label, and never passes force: an image a container still uses is refused
 * by the daemon.
 */
export function registerDeleteImageTool(server: McpServer, images: ImageService): void {
    server.registerTool(
        'delete_image',
        {
            title: 'Delete image',
            description:
                'Deletes one platform-built image. Refused when a container still uses it (delete that '
                + 'container first) and for images the platform did not build. Runs only after the user '
                + 'approves the call.',
            inputSchema: z.object({
                image: z.string().min(1).describe('Image id or tag, as list_images reports it.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            await images.deleteManagedImage(args.image);
            return toTextToolResult(`Image "${args.image}" deleted.`);
        }),
    );
}
