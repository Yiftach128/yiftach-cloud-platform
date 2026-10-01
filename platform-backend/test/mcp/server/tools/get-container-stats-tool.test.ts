/**
 * get_container_stats as a model reads it, through the in-process MCP client
 * over the container-service fake: samples joined to container names in MiB
 * and percent, the same managed-only default as list_containers, and a
 * container that lost its sample left out rather than shown as zero.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ContainerStatsToolResult, ContainerStatsToolRow } from '../../../../src/mcp/server/interfaces.ts';
import { sampleContainer } from '../../../services/docker/sample-docker-records.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

const MEBIBYTE: number = 1024 * 1024;
const WEB_ID: string = 'a'.repeat(64);
const API_ID: string = 'b'.repeat(64);

test('each running container gets a row under its name: CPU percent, memory in MiB and as a share of the limit', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [sampleContainer({ id: WEB_ID, name: 'web' })];
    tools.docker.stats = { [WEB_ID]: { cpuPercent: 12.345, memoryUsedBytes: 50 * MEBIBYTE, memoryLimitBytes: 200 * MEBIBYTE } };

    const result: ContainerStatsToolResult = await tools.callJson('get_container_stats', {});

    assert.deepEqual(result.containers, [{ name: 'web', cpuPercent: 12.35, memoryUsedMiB: 50, memoryLimitMiB: 200, memoryPercent: 25 }]);
    assert.deepEqual(tools.docker.calls[0], { method: 'getContainers', arguments: [{ all: false }] });
});

test('containers the platform did not create are left out and counted, as in list_containers; includeUnmanaged shows them', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [
        sampleContainer({ id: WEB_ID, name: 'web' }),
        sampleContainer({ id: API_ID, name: 'grafana', labels: {} }),
    ];
    tools.docker.stats = {
        [WEB_ID]: { cpuPercent: 1, memoryUsedBytes: MEBIBYTE, memoryLimitBytes: 4 * MEBIBYTE },
        [API_ID]: { cpuPercent: 2, memoryUsedBytes: MEBIBYTE, memoryLimitBytes: 4 * MEBIBYTE },
    };

    const managedOnly: ContainerStatsToolResult = await tools.callJson('get_container_stats', {});
    const everything: ContainerStatsToolResult = await tools.callJson('get_container_stats', { includeUnmanaged: true });

    assert.deepEqual(managedOnly.containers.map(nameOf), ['web']);
    assert.equal(managedOnly.hiddenUnmanagedCount, 1);
    assert.match(String(managedOnly.hiddenUnmanagedNote), /call this tool again with includeUnmanaged: true\.$/);
    assert.deepEqual(everything.containers.map(nameOf), ['web', 'grafana']);
    assert.equal(everything.hiddenUnmanagedCount, 0);
});

test('a container listed as running but missing from the samples (stopped between the two reads) is left out, not reported as zero', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.containers = [
        sampleContainer({ id: WEB_ID, name: 'web' }),
        sampleContainer({ id: API_ID, name: 'api' }),
    ];
    tools.docker.stats = { [WEB_ID]: { cpuPercent: 1, memoryUsedBytes: MEBIBYTE, memoryLimitBytes: 4 * MEBIBYTE } };

    const result: ContainerStatsToolResult = await tools.callJson('get_container_stats', {});

    assert.deepEqual(result.containers.map(nameOf), ['web']);
});

function nameOf(row: ContainerStatsToolRow): string {
    return row.name;
}
