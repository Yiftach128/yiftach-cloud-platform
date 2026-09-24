import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { DockerManagerService } from '../../../services/docker/docker-manager-service.ts';
import type { ContainerLogLine, ContainerLogs } from '../../../services/docker/interfaces.ts';
import { runToolWithErrorMapping } from '../tool-results-utils/run-tool-with-error-mapping.ts';
import { toTextToolResult } from '../tool-results-utils/tool-result-builders.ts';

const DEFAULT_TAIL_LINES = 50;
/** Hard ceiling: a log tail lands in a model's context window, which a full log would flood. */
const MAX_TAIL_LINES = 200;
/** Longer lines (minified JSON, stack dumps) are cut, so one line cannot eat the whole budget. */
const MAX_LINE_LENGTH = 500;
/** "2026-08-02T18:46:42" — the daemon's nanosecond fraction is noise to a reader. */
const TIMESTAMP_SECONDS_LENGTH = 19;

/**
 * get_container_logs — the tail of one container's log, rendered as plain text
 * (the GET /containers/:id/logs counterpart). Text rather than JSON on purpose:
 * it costs roughly half the tokens per line.
 */
export function registerGetContainerLogsTool(server: McpServer, docker: DockerManagerService): void {
    server.registerTool(
        'get_container_logs',
        {
            title: 'Get container logs',
            description:
                'Returns the most recent log lines of one container, oldest first. Use it to find out '
                + 'why a container crashed or misbehaves.',
            inputSchema: z.object({
                container: z.string().min(1).describe('Container name or id, as list_containers reports it.'),
                // Coerced: small models often send numbers as strings ("50").
                tail: z.coerce.number().int().min(1).max(MAX_TAIL_LINES).optional()
                    .describe(`How many of the most recent lines to return (1-${MAX_TAIL_LINES}). Defaults to ${DEFAULT_TAIL_LINES}.`),
            }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => runToolWithErrorMapping(async () => {
            let tail: number;
            if (args.tail === undefined) {
                tail = DEFAULT_TAIL_LINES;
            } else {
                tail = args.tail;
            }
            const logs: ContainerLogs = await docker.getContainerLogs(args.container, { tail: tail });
            return toTextToolResult(renderLogs(args.container, logs));
        }),
    );
}

function renderLogs(container: string, logs: ContainerLogs): string {
    if (logs.lines.length === 0) {
        return `Container "${container}" has produced no log output.`;
    }
    const header: string = `Last ${logs.lines.length} log lines of container "${container}" (oldest first):`;
    return [header].concat(logs.lines.map(renderLine)).join('\n');
}

function renderLine(line: ContainerLogLine): string {
    let text: string;
    if (line.text.length > MAX_LINE_LENGTH) {
        text = `${line.text.substring(0, MAX_LINE_LENGTH)}... [line cut]`;
    } else {
        text = line.text;
    }
    if (line.timestamp === '') {
        return `[${line.stream}] ${text}`;
    }
    return `${line.timestamp.substring(0, TIMESTAMP_SECONDS_LENGTH)}Z [${line.stream}] ${text}`;
}
