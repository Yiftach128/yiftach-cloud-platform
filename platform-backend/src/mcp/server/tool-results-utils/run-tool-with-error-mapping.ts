import type { CallToolResult } from '@modelcontextprotocol/server';

import { DockerApiError } from '../../../services/docker/docker-api-error.ts';
import { DockerConnectionError } from '../../../services/docker/docker-connection-error.ts';
import { ImageNotManagedError } from '../../../services/docker/image-not-managed-error.ts';

/**
 * Runs one tool call and maps service-layer failures onto MCP tool errors, so
 * the tool files stay thin — the MCP counterpart of
 * `middleware/error-handler.ts`, and the only place service errors become tool
 * errors. A failure is reported *in band* (`isError: true` with a message the
 * model can read and act on, e.g. retry with another name) rather than thrown:
 * a thrown error would surface as a protocol-level fault instead.
 */
export async function runToolWithErrorMapping(call: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await call();
    } catch (error) {
        return toToolErrorResult(error);
    }
}

function toToolErrorResult(error: unknown): CallToolResult {
    let text: string;
    if (error instanceof ImageNotManagedError) {
        // Not error.message: that one is worded for the delete endpoint ("refusing to delete it").
        text = `Image "${error.image}" was not built by this platform, so it cannot be inspected here. `
            + 'Only the images list_images reports are available.';
    } else if (error instanceof DockerApiError) {
        if (error.status === 404) {
            text = `Not found: ${error.message}`;
        } else {
            text = `The Docker daemon refused the request (HTTP ${error.status}): ${error.message}`;
        }
    } else if (error instanceof DockerConnectionError) {
        text = `The Docker daemon is unreachable: ${error.message}`;
    } else if (error instanceof Error) {
        text = `Unexpected error: ${error.message}`;
    } else {
        text = `Unexpected error: ${String(error)}`;
    }
    return { content: [{ type: 'text', text: text }], isError: true };
}
