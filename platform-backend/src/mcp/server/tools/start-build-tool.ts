import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { BuildQueueService } from '../../../services/builds/build-queue-service.ts';
import type { BuildJob, StartBuildOptions } from '../../../services/builds/interfaces.ts';
import { parseStartBuildRequest } from '../../../services/validation/parse-start-build-request.ts';
import { mapBuildJobToToolView } from '../tool-results-utils/map-build-job-to-tool-view.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/**
 * start_build — queues a build of a public GitHub repository together with the
 * container to create from it (the POST /builds counterpart). The platform's
 * request parser applies the REST route's rules to the arguments (URL shape,
 * container fields), in band. Answers with the queued job at once: the build
 * itself runs on the builder service for minutes, and get_build is how it is
 * looked at later.
 */
export function registerStartBuildTool(server: McpServer, builds: BuildQueueService): void {
    server.registerTool(
        'start_build',
        {
            title: 'Start build',
            description:
                'Queues a build of a public GitHub repository and the container to create from the built '
                + 'image. Returns the queued job at once; the build then runs in the background for '
                + 'minutes. Report the job id to the user and tell them to ask later how the build is '
                + 'doing — do not call get_build in the same turn.',
            inputSchema: z.object({
                gitUrl: z.string().min(1)
                    .describe('Repository URL, e.g. "https://github.com/owner/repo", with "#branch-or-tag" appended to build a branch or tag.'),
                name: z.string().min(1)
                    .describe('Name for the container created from the built image: 1-63 letters, digits, "_", "." or "-".'),
                imageName: z.string().optional()
                    .describe('Tag for the built image, "name" or "name:tag" in lowercase. Omit to let the platform generate one.'),
                ports: z.array(z.object({
                    // Coerced: small models often send numbers as strings ("8080").
                    hostPort: z.coerce.number().int().describe('Port opened on the host machine.'),
                    containerPort: z.coerce.number().int().describe('Port the service listens on inside the container.'),
                })).optional()
                    .describe('TCP ports to publish on the container. Omit to publish the ports the image EXPOSEs, host port equal to container port.'),
                env: z.record(z.string(), z.string()).optional()
                    .describe('Environment variables for the container, by name. Omit for none.'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const options: StartBuildOptions = parseStartBuildRequest(args);
            const job: BuildJob = builds.enqueue(options);
            return toJsonToolResult(mapBuildJobToToolView(job));
        }),
    );
}
