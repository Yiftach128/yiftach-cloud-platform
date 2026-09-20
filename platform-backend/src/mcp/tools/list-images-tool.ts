import type { McpServer } from '@modelcontextprotocol/server';

import type { DockerImageService } from '../../services/docker/docker-image-service.ts';
import type { ImageSummary } from '../../services/docker/interfaces.ts';
import type { ImageToolSummary } from '../interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';
import { toMebibytes, toShortImageId } from '../tool-results-utils/tool-result-value-formatters.ts';

/** list_images — the platform-built images, as compact summaries (the GET /images counterpart). */
export function registerListImagesTool(server: McpServer, images: DockerImageService): void {
    server.registerTool(
        'list_images',
        {
            title: 'List platform-built images',
            description:
                'Lists the images this platform built from GitHub repositories (images pulled from a '
                + 'registry are not included): id, tags, size, and how many containers use each.',
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => runToolWithErrorMapping(async () => {
            const managed: ImageSummary[] = await images.getManagedImages();
            return toJsonToolResult(managed.map(toSummary));
        }),
    );
}

function toSummary(image: ImageSummary): ImageToolSummary {
    return {
        id: toShortImageId(image.id),
        tags: image.tags,
        createdAt: image.createdAt,
        sizeMiB: toMebibytes(image.sizeBytes),
        containers: image.containers,
    };
}
