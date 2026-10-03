/**
 * create_container as a model reads it, through the in-process MCP client
 * over the container-service fake: the arguments are held to the REST
 * route's field rules before the service is asked, ports arrive as numbers
 * however the model wrote them, and the answer is the get_container view —
 * environment variable names only.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ContainerToolDetails } from '../../../../src/mcp/server/interfaces.ts';
import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import type { ContainerDetails } from '../../../../src/services/docker/interfaces.ts';
import { SAMPLE_CONTAINER_SHORT_ID, sampleContainerDetails } from '../../../services/docker/sample-docker-records.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

test('a name the REST route would refuse is refused here too, in band, before the service is asked', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    const outcome: ToolCallOutcome = await tools.call('create_container', { name: '-web', image: 'nginx:1.27' });

    assert.equal(outcome.isError, true);
    assert.equal(
        outcome.text,
        'Invalid arguments: "name" must be 1-63 characters of letters, digits, "_", ".", or "-", starting with a letter or digit',
    );
    assert.deepEqual(tools.docker.calls, []);
});

test('ports written as strings reach the service as numbers; ports and env left out arrive empty', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.details = sampleContainerDetails();

    await tools.callJson('create_container', {
        name: 'web',
        image: 'nginx:1.27',
        ports: [{ hostPort: '8080', containerPort: '80' }],
        env: { TZ: 'UTC' },
    });
    await tools.callJson('create_container', { name: 'cache', image: 'redis:7' });

    assert.deepEqual(tools.docker.calls, [
        {
            method: 'createContainer',
            arguments: [{ name: 'web', image: 'nginx:1.27', ports: [{ hostPort: 8080, containerPort: 80 }], env: { TZ: 'UTC' } }],
        },
        { method: 'createContainer', arguments: [{ name: 'cache', image: 'redis:7', ports: [], env: {} }] },
    ]);
});

test('the answer is the get_container view of the new container: a short id, and environment variable names without their values', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    const created: ContainerDetails = sampleContainerDetails({ name: 'db', image: 'postgres:16' });
    created.config.env = ['POSTGRES_PASSWORD=hunter2', 'TZ=UTC'];
    tools.docker.details = created;

    const outcome: ToolCallOutcome = await tools.call('create_container', { name: 'db', image: 'postgres:16' });
    const view: ContainerToolDetails = JSON.parse(outcome.text);

    assert.equal(outcome.isError, false);
    assert.equal(view.id, SAMPLE_CONTAINER_SHORT_ID);
    assert.deepEqual(view.envNames, ['POSTGRES_PASSWORD', 'TZ']);
    assert.equal(outcome.text.includes('hunter2'), false);
});
