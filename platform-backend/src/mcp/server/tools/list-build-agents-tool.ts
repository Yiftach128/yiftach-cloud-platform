import type { McpServer } from '@modelcontextprotocol/server';

import type { BuildAgentRegistry } from '../../../services/build-agents/build-agent-registry.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toJsonToolResult } from '../tool-results-utils/tool-result-builders.ts';

/** list_build_agents — the builder processes and what each is doing (the GET /build-agents counterpart). */
export function registerListBuildAgentsTool(server: McpServer, buildAgents: BuildAgentRegistry): void {
    server.registerTool(
        'list_build_agents',
        {
            title: 'List build agents',
            description:
                'Lists the build agents — the builder processes that turn GitHub repositories into '
                + 'images: status (idle, building or offline), the job being built, start time and '
                + 'last heartbeat.',
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => runToolWithErrorMapping(async () => {
            return toJsonToolResult(buildAgents.listAgents());
        }),
    );
}
