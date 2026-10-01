/**
 * delete_container as a model reads it, through the in-process MCP client
 * over the container-service fake: the delete is asked plainly, without force
 * or volume removal, so the daemon decides about a running container and its
 * refusal reaches the model in band, in the daemon's words.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import { DockerApiError } from '../../../../src/services/docker/docker-api-error.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

const RUNNING_REFUSAL: string = 'cannot remove container "web": container is running: stop the container before removing or force remove';

test('neither force nor volume removal is passed, so a running container\'s refusal comes back from the daemon in its words', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.failWith('deleteContainer', new DockerApiError(RUNNING_REFUSAL, 409, 'DELETE /containers/web'));

    const outcome: ToolCallOutcome = await tools.call('delete_container', { container: 'web' });

    assert.deepEqual(tools.docker.calls, [{ method: 'deleteContainer', arguments: ['web', undefined] }]);
    assert.equal(outcome.isError, true);
    assert.equal(outcome.text, `The Docker daemon refused the request (HTTP 409): ${RUNNING_REFUSAL}`);
});
