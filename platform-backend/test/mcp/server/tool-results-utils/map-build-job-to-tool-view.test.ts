/**
 * The build job as start_build and get_build answer it: the progress log cut
 * to its newest lines, the optional fields present only when the job has
 * them. Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapBuildJobToToolView } from '../../../../src/mcp/server/tool-results-utils/map-build-job-to-tool-view.ts';
import type { BuildJobToolView } from '../../../../src/mcp/server/interfaces.ts';
import type { BuildJob } from '../../../../src/services/builds/interfaces.ts';

test('the progress log is cut to its newest 30 lines, oldest first', () => {
    const lines: string[] = [];
    for (let number = 1; number <= 45; number++) {
        lines.push(`Step ${number}`);
    }

    const view: BuildJobToolView = mapBuildJobToToolView(jobOf({ logLines: lines }));

    assert.equal(view.recentLogLines.length, 30);
    assert.equal(view.recentLogLines[0], 'Step 16');
    assert.equal(view.recentLogLines[29], 'Step 45');
});

test('finishedAt and errorMessage appear only when the job has them', () => {
    const queued: BuildJobToolView = mapBuildJobToToolView(jobOf({}));
    const failed: BuildJobToolView = mapBuildJobToToolView(jobOf({
        status: 'failed',
        finishedAt: new Date('2026-09-30T08:05:00.000Z'),
        errorMessage: 'Dockerfile not found',
    }));

    assert.equal('finishedAt' in queued, false);
    assert.equal('errorMessage' in queued, false);
    assert.deepEqual(failed.finishedAt, new Date('2026-09-30T08:05:00.000Z'));
    assert.equal(failed.errorMessage, 'Dockerfile not found');
});

function jobOf(overrides: Partial<BuildJob>): BuildJob {
    const base: BuildJob = {
        id: 'job-7',
        status: 'queued',
        gitUrl: 'https://github.com/owner/repo',
        imageTag: 'cloudplatform/build-owner-repo:0123abcd',
        containerName: 'web',
        createdAt: new Date('2026-09-30T08:00:00.000Z'),
        logLines: [],
    };
    return { ...base, ...overrides };
}
