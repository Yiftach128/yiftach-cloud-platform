/**
 * start_container as a model reads it, through the in-process MCP client over
 * the container-service fake: the one line it answers reports the state
 * inspected after the start, never the state the start implies. Stop and
 * restart answer through the same renderer.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import type { ContainerDetails } from '../../../../src/services/docker/interfaces.ts';
import { sampleContainerDetails } from '../../../services/docker/sample-docker-records.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

test('the state reported is the one inspected after the start: a container that exited at once reads as exited, with its exit code', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    const exitedAtOnce: ContainerDetails = sampleContainerDetails();
    exitedAtOnce.state.status = 'exited';
    exitedAtOnce.state.exitCode = 1;
    tools.docker.details = exitedAtOnce;

    const outcome: ToolCallOutcome = await tools.call('start_container', { container: 'web' });

    assert.equal(outcome.isError, false);
    assert.equal(outcome.text, 'Container "web" started. State now: exited (exit code 1).');
    assert.deepEqual(tools.docker.calls, [
        { method: 'startContainer', arguments: ['web'] },
        { method: 'getContainerById', arguments: ['web'] },
    ]);
});
