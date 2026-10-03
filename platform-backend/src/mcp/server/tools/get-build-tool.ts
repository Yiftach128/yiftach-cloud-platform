import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { BuildQueueService } from '../../../services/builds/build-queue-service.ts';
import type { BuildJob } from '../../../services/builds/interfaces.ts';
import { mapBuildJobToToolView } from '../tool-results-utils/map-build-job-to-tool-view.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/** get_build — one build job's status and newest progress lines (the GET /builds/:id counterpart). */
export function registerGetBuildTool(server: McpServer, builds: BuildQueueService): void {
    server.registerTool(
        'get_build',
        {
            title: 'Get build job',
            description:
                'Returns one build job: status (queued, running, succeeded or failed), the image tag and '
                + 'container it produces, the error message when it failed, and its newest progress lines. '
                + 'Jobs are forgotten 30 minutes after they finish and when the platform restarts.',
            inputSchema: z.object({
                jobId: z.string().min(1).describe('The job id start_build returned.'),
            }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            const job: BuildJob = builds.getJob(args.jobId);
            return toJsonToolResult(mapBuildJobToToolView(job));
        }),
    );
}
