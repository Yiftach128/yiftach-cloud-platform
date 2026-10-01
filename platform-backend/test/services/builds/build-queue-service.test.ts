/**
 * The build queue the builder works off: the image tag a job gets, the clone
 * URL it is handed, the queue cap, unknown ids, the daemon warm-up on claim,
 * the default failure message and the stale sweep's schedule. The registry is
 * real; the daemon lifecycle is a fake; the clock and the timers are the
 * runner's.
 */

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';

import { BuildJobNotFoundError } from '../../../src/services/builds/build-job-not-found-error.ts';
import { BuildJobRegistry } from '../../../src/services/builds/build-job-registry.ts';
import { BuildQueueFullError } from '../../../src/services/builds/build-queue-full-error.ts';
import { BuildQueueService } from '../../../src/services/builds/build-queue-service.ts';
import type { BuildJob, BuildTask, StartBuildOptions } from '../../../src/services/builds/interfaces.ts';
import { RecordingDockerDaemonLifecycle } from '../docker/fakes/recording-docker-daemon-lifecycle.ts';

const MINUTE_MS: number = 60_000;
const STALE_TIMEOUT_MS: number = 10 * MINUTE_MS;

test('a job gets the tag cloudplatform/build-<owner>-<repo>:<8 hex of its id>, the segments lowercased and sanitized', () => {
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());

    const job: BuildJob = queue.enqueue(buildOf('Yiftach128', 'My.Repo@2'));

    assert.match(job.imageTag, /^cloudplatform\/build-yiftach128-my\.repo-2:[0-9a-f]{8}$/);
    assert.equal(job.imageTag.slice(-8), job.id.replaceAll('-', '').slice(0, 8));
    assert.equal(job.status, 'queued');
});

test('a given image name is the tag as given', () => {
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());

    const job: BuildJob = queue.enqueue({ ...buildOf('owner', 'repo'), imageName: 'team/my-app:v2' });

    assert.equal(job.imageTag, 'team/my-app:v2');
});

test('the builder is handed the canonical clone URL, ".git" appended, not the URL as submitted', () => {
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());
    queue.enqueue(buildOf('owner', 'repo'));

    const task: BuildTask | undefined = queue.claimNextTask();

    assert.ok(task !== undefined);
    assert.equal(task.gitUrl, 'https://github.com/owner/repo.git');
});

test('the eleventh waiting job is refused; a claimed job frees its place', () => {
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());
    for (let number = 1; number <= 10; number++) {
        queue.enqueue(buildOf('owner', `repo-${number}`));
    }

    assert.throws(() => queue.enqueue(buildOf('owner', 'repo-11')), new BuildQueueFullError(10));

    queue.claimNextTask();
    assert.equal(queue.enqueue(buildOf('owner', 'repo-11')).status, 'queued');
});

test('an unknown job id is "not found" for a poll, a log append and a result', () => {
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());

    assert.throws(() => queue.getJob('nope'), new BuildJobNotFoundError('nope'));
    assert.throws(() => queue.appendLogs('nope', ['Step 1/3']), new BuildJobNotFoundError('nope'));
    assert.throws(() => queue.completeJob('nope', { status: 'succeeded' }), new BuildJobNotFoundError('nope'));
});

test('a claim warms the docker daemon; an empty poll does not', () => {
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    const queue: BuildQueueService = createQueue(daemon);

    assert.equal(queue.claimNextTask(), undefined);
    assert.equal(daemon.ensureRunningCalls, 0);

    queue.enqueue(buildOf('owner', 'repo'));
    assert.ok(queue.claimNextTask() !== undefined);
    assert.equal(daemon.ensureRunningCalls, 1);
});

test('a failing warm-up does not fail the claim', async (t: TestContext) => {
    t.mock.method(console, 'warn', () => {});
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    daemon.failWith(new Error('the distro did not boot'));
    const queue: BuildQueueService = createQueue(daemon);
    queue.enqueue(buildOf('owner', 'repo'));

    const task: BuildTask | undefined = queue.claimNextTask();
    await setImmediate();

    assert.ok(task !== undefined);
    assert.equal(queue.getJob(task.jobId).status, 'running');
});

test('a failed result without detail gets the default message; a given detail is kept; a success has none', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());
    const bare: BuildJob = queue.enqueue(buildOf('owner', 'bare'));
    const detailed: BuildJob = queue.enqueue(buildOf('owner', 'detailed'));
    const succeeded: BuildJob = queue.enqueue(buildOf('owner', 'succeeded'));

    queue.completeJob(bare.id, { status: 'failed' });
    queue.completeJob(detailed.id, { status: 'failed', errorMessage: 'Dockerfile not found' });
    queue.completeJob(succeeded.id, { status: 'succeeded' });

    assert.equal(queue.getJob(bare.id).errorMessage, 'The builder reported no failure detail');
    assert.equal(queue.getJob(detailed.id).errorMessage, 'Dockerfile not found');
    assert.equal(queue.getJob(succeeded.id).errorMessage, undefined);
});

test('once started, the sweep fails a silent running job on the first minute past the stale timeout', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
    const queue: BuildQueueService = createQueue(new RecordingDockerDaemonLifecycle());
    const job: BuildJob = queue.enqueue(buildOf('owner', 'repo'));
    queue.claimNextTask();
    queue.start();

    t.mock.timers.tick(STALE_TIMEOUT_MS);
    assert.equal(queue.getJob(job.id).status, 'running');

    t.mock.timers.tick(MINUTE_MS);
    assert.equal(queue.getJob(job.id).status, 'failed');
});

function createQueue(daemon: RecordingDockerDaemonLifecycle): BuildQueueService {
    return new BuildQueueService(new BuildJobRegistry(), daemon, STALE_TIMEOUT_MS);
}

function buildOf(owner: string, repo: string): StartBuildOptions {
    return {
        gitUrl: `https://github.com/${owner}/${repo}`,
        owner: owner,
        repo: repo,
        container: { name: 'web', ports: [], env: {} },
    };
}
