/**
 * list_containers as a model reads it, through the in-process MCP client over
 * the container-service fake: the platform's own containers by default with
 * the count of the rest and a note on how to see them, everything on request,
 * the state filter handed to the daemon, and rows shaped for a context window.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ContainerListToolResult, ContainerToolSummary } from '../../../../src/mcp/server/interfaces.ts';
import { SAMPLE_CONTAINER_SHORT_ID, sampleContainer } from '../../../services/docker/sample-docker-records.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

test('only the containers the platform created are listed by default; the rest are counted, with a note naming the call that includes them', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [
        sampleContainer({ name: 'web' }),
        sampleContainer({ name: 'grafana', labels: {} }),
        sampleContainer({ name: 'prometheus', labels: {} }),
    ];

    const result: ContainerListToolResult = await tools.callJson('list_containers', {});

    assert.deepEqual(result.containers.map(nameOf), ['web']);
    assert.equal(result.hiddenUnmanagedCount, 2);
    assert.equal(
        result.hiddenUnmanagedNote,
        '2 containers the platform did not create are not listed. A container the user asked about that is '
        + 'missing here is one of them: call this tool again with includeUnmanaged: true.',
    );

    tools.docker.containers = [sampleContainer({ name: 'grafana', labels: {} })];
    const oneHidden: ContainerListToolResult = await tools.callJson('list_containers', {});
    assert.match(String(oneHidden.hiddenUnmanagedNote), /^1 container the platform did not create is not listed\./);
});

test('includeUnmanaged lists every container, each saying whether it is the platform\'s, with a zero count and no note', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [
        sampleContainer({ name: 'web' }),
        sampleContainer({ name: 'grafana', labels: {} }),
    ];

    const result: ContainerListToolResult = await tools.callJson('list_containers', { includeUnmanaged: true });

    assert.deepEqual(result.containers.map(nameOf), ['web', 'grafana']);
    assert.deepEqual(result.containers.map(managedOf), [true, false]);
    assert.equal(result.hiddenUnmanagedCount, 0);
    assert.equal('hiddenUnmanagedNote' in result, false);
});

test('the list asks the daemon for stopped containers too; a state filter is handed to the daemon as a status filter', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    await tools.callJson('list_containers', {});
    await tools.callJson('list_containers', { state: 'exited' });

    assert.deepEqual(tools.docker.calls, [
        { method: 'getContainers', arguments: [{ all: true }] },
        { method: 'getContainers', arguments: [{ all: true, filters: { status: ['exited'] } }] },
    ]);
});

test('a row is the short id, the name, image, state and status, and the ports as docker ps strings', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [sampleContainer({
        ports: [
            { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' },
            { privatePort: 9090, type: 'tcp' },
        ],
    })];

    const result: ContainerListToolResult = await tools.callJson('list_containers', {});

    assert.deepEqual(result.containers, [{
        id: SAMPLE_CONTAINER_SHORT_ID,
        name: 'web',
        image: 'nginx:1.27',
        state: 'running',
        status: 'Up 2 hours',
        ports: ['8080->80/tcp', '9090/tcp (not published)'],
        managed: true,
    }]);
});

function nameOf(row: ContainerToolSummary): string {
    return row.name;
}

function managedOf(row: ContainerToolSummary): boolean {
    return row.managed;
}
