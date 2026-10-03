/**
 * POST /builds-queue/claim, the builder's poll: the oldest queued job as a
 * task with 200, or 204 with nothing when the queue is empty. Over HTTP
 * in-process, on the real `BuildQueueService` over a fake daemon lifecycle.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { postBuildsQueueClaimRoute } from '../../src/routes/post-builds-queue-claim.ts';
import { BuildJobRegistry } from '../../src/services/builds/build-job-registry.ts';
import { BuildQueueService } from '../../src/services/builds/build-queue-service.ts';
import type { BuildJob } from '../../src/services/builds/interfaces.ts';
import { RecordingDockerDaemonLifecycle } from '../services/docker/fakes/recording-docker-daemon-lifecycle.ts';
import { HttpAppUnderTest } from './http-app-under-test.ts';

test('a claim answers the oldest queued job as a task with 200, and 204 with no body once the queue is empty', async (t: TestContext) => {
    const builds: BuildQueueService = new BuildQueueService(new BuildJobRegistry(), new RecordingDockerDaemonLifecycle(), 10 * 60_000);
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [postBuildsQueueClaimRoute(builds)]);
    const job: BuildJob = builds.enqueue({
        gitUrl: 'https://github.com/owner/repo',
        owner: 'owner',
        repo: 'repo',
        container: { name: 'web', ports: [], env: {} },
    });

    const claimed: Response = await app.request('POST', '/builds-queue/claim');
    const empty: Response = await app.request('POST', '/builds-queue/claim');

    assert.equal(claimed.status, 200);
    assert.deepEqual(await claimed.json(), {
        jobId: job.id,
        gitUrl: 'https://github.com/owner/repo.git',
        imageTag: job.imageTag,
        container: { name: 'web', ports: [], env: {} },
    });
    assert.equal(empty.status, 204);
    assert.equal(await empty.text(), '');
});
