/**
 * get_container_logs as a model reads it, through the in-process MCP client
 * over the container-service fake: a plain-text tail with second-precision
 * timestamps, the tail argument's default, coercion and ceiling, long lines
 * cut, and a sentence for a silent container.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

test('the lines are rendered as text under a header, oldest first, each with its stream and the timestamp cut to seconds', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.logs = {
        tty: false,
        lines: [
            { stream: 'stdout', timestamp: '2026-08-02T18:46:42.037262344Z', text: 'ready' },
            { stream: 'stderr', timestamp: '2026-08-02T18:46:43.000000000Z', text: 'oops' },
            { stream: 'stdout', timestamp: '', text: 'no stamp' },
        ],
    };

    const outcome: ToolCallOutcome = await tools.call('get_container_logs', { container: 'web' });

    assert.equal(outcome.isError, false);
    assert.equal(outcome.text, [
        'Last 3 log lines of container "web" (oldest first):',
        '2026-08-02T18:46:42Z [stdout] ready',
        '2026-08-02T18:46:43Z [stderr] oops',
        '[stdout] no stamp',
    ].join('\n'));
});

test('the tail is 50 lines unless given, taken as a string too, and refused above 200 before the service is asked', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    await tools.call('get_container_logs', { container: 'web' });
    await tools.call('get_container_logs', { container: 'web', tail: '20' });
    const refused: ToolCallOutcome = await tools.call('get_container_logs', { container: 'web', tail: 201 });

    assert.deepEqual(tools.docker.calls, [
        { method: 'getContainerLogs', arguments: ['web', { tail: 50 }] },
        { method: 'getContainerLogs', arguments: ['web', { tail: 20 }] },
    ]);
    assert.equal(refused.isError, true);
    assert.match(refused.text, /tail/);
});

test('a line longer than 500 characters is cut, so one line cannot eat the whole result', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    tools.docker.logs = { tty: false, lines: [{ stream: 'stdout', timestamp: '', text: 'x'.repeat(501) }] };

    const outcome: ToolCallOutcome = await tools.call('get_container_logs', { container: 'web' });

    assert.equal(outcome.text.split('\n')[1], `[stdout] ${'x'.repeat(500)}... [line cut]`);
});

test('a container without output is answered in a sentence, not an empty header', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    const outcome: ToolCallOutcome = await tools.call('get_container_logs', { container: 'web' });

    assert.equal(outcome.text, 'Container "web" has produced no log output.');
});
