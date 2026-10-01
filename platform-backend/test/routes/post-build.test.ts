/**
 * POST /builds: a build is accepted, not performed — 202 with the queued job
 * the client will poll, 429 once the queue is full. Over HTTP in-process, on
 * the real `BuildQueueService` over a fake daemon lifecycle.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { postBuildRoute } from '../../src/routes/post-build.ts';
import { BuildJobRegistry } from '../../src/services/builds/build-job-registry.ts';
import { BuildQueueService } from '../../src/services/builds/build-queue-service.ts';
import { RecordingDockerDaemonLifecycle } from '../services/docker/fakes/recording-docker-daemon-lifecycle.ts';
import { HttpAppUnderTest } from './http-app-under-test.ts';

test('a build is accepted with 202 and the queued job; the eleventh waiting one is refused with 429', async (t: TestContext) => {
    const builds: BuildQueueService = new BuildQueueService(new BuildJobRegistry(), new RecordingDockerDaemonLifecycle(), 10 * 60_000);
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [postBuildRoute(builds)]);

    const accepted: Response = await app.request('POST', '/builds', { gitUrl: 'https://github.com/owner/repo-1', name: 'web-1' });
    const job: { id: string; status: string; gitUrl: string; containerName: string; imageTag: string } = await HttpAppUnderTest.readJson(accepted);
    for (let number = 2; number <= 10; number++) {
        await app.request('POST', '/builds', { gitUrl: `https://github.com/owner/repo-${number}`, name: `web-${number}` });
    }
    const refused: Response = await app.request('POST', '/builds', { gitUrl: 'https://github.com/owner/repo-11', name: 'web-11' });

    assert.equal(accepted.status, 202);
    assert.equal(job.status, 'queued');
    assert.equal(job.gitUrl, 'https://github.com/owner/repo-1');
    assert.equal(job.containerName, 'web-1');
    assert.match(job.imageTag, /^cloudplatform\/build-owner-repo-1:[0-9a-f]{8}$/);
    assert.equal(refused.status, 429);
    assert.deepEqual(await refused.json(), { message: 'The build queue is full (10 waiting jobs); try again after one finishes' });
});
