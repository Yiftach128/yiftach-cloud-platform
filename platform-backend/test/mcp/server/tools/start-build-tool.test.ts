/**
 * start_build as a model reads it, through the in-process MCP client over
 * the real build queue (the real registry, a daemon-lifecycle fake): the
 * arguments are held to the REST route's rules, the queued job is answered at
 * once in its tool view, and a full queue refuses in band in the queue's
 * words.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { BuildJobToolView } from '../../../../src/mcp/server/interfaces.ts';
import type { ToolCallOutcome } from '../../../../src/services/ai-agent/interfaces.ts';
import type { StartBuildOptions } from '../../../../src/services/builds/interfaces.ts';
import { PlatformMcpToolsWithFakes } from '../../platform-mcp-tools-with-fakes.ts';

test('a build is queued through the REST parser and answered at once as the queued job: status, tag, container, no progress yet', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    const view: BuildJobToolView = await tools.callJson('start_build', {
        gitUrl: 'https://github.com/owner/repo#main',
        name: 'web',
        ports: [{ hostPort: '8080', containerPort: '80' }],
    });

    assert.equal(view.status, 'queued');
    assert.equal(view.gitUrl, 'https://github.com/owner/repo#main');
    assert.match(view.imageTag, /^cloudplatform\/build-owner-repo:[0-9a-f]{8}$/);
    assert.equal(view.containerName, 'web');
    assert.deepEqual(view.recentLogLines, []);
    assert.equal('errorMessage' in view, false);
    assert.equal(tools.builds.getJob(view.id).status, 'queued');
});

test('a repository URL the REST route would refuse is refused here too, in band, and nothing is queued', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);

    const outcome: ToolCallOutcome = await tools.call('start_build', { gitUrl: 'https://gitlab.com/owner/repo', name: 'web' });

    assert.equal(outcome.isError, true);
    assert.equal(outcome.text, 'Invalid arguments: "gitUrl" must point at github.com');
    assert.equal(tools.builds.claimNextTask(), undefined);
});

test('the eleventh waiting build is refused in band with the queue\'s own message', async (t: TestContext) => {
    const tools: PlatformMcpToolsWithFakes = await PlatformMcpToolsWithFakes.connect(t);
    for (let number = 1; number <= 10; number++) {
        tools.builds.enqueue(buildOf(`repo-${number}`));
    }

    const outcome: ToolCallOutcome = await tools.call('start_build', { gitUrl: 'https://github.com/owner/repo-11', name: 'web' });

    assert.equal(outcome.isError, true);
    assert.equal(outcome.text, 'The build queue is full (10 waiting jobs); try again after one finishes');
});

function buildOf(repo: string): StartBuildOptions {
    return {
        gitUrl: `https://github.com/owner/${repo}`,
        owner: 'owner',
        repo: repo,
        container: { name: 'web', ports: [], env: {} },
    };
}
