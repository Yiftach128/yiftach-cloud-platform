/**
 * The in-memory job store behind the build queue: FIFO claiming, the log cap,
 * the first-terminal-status rule, the expiry of finished jobs and the stale
 * rule. Nothing faked; the clock and the timers are the runner's.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { BuildJobRegistry } from '../../../src/services/builds/build-job-registry.ts';
import type { BuildJob, BuildTask, StartBuildOptions } from '../../../src/services/builds/interfaces.ts';

const CLONE_URL: string = 'https://github.com/owner/repo.git';
const START_BUILD: StartBuildOptions = {
    gitUrl: 'https://github.com/owner/repo#main',
    owner: 'owner',
    repo: 'repo',
    gitRef: 'main',
    container: { name: 'web', ports: [{ hostPort: 8080, containerPort: 80 }], env: {} },
};
const MINUTE_MS: number = 60_000;
const STALE_TIMEOUT_MS: number = 10 * MINUTE_MS;

test('the oldest queued job is claimed first, becomes running, and its task carries the clone URL', () => {
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'first');
    createJob(registry, 'second');

    const task: BuildTask | undefined = registry.claimOldestQueued();

    assert.deepEqual(task, {
        jobId: 'first',
        gitUrl: CLONE_URL,
        gitRef: 'main',
        imageTag: 'image:first',
        container: START_BUILD.container,
    });
    assert.equal(jobOf(registry, 'first').status, 'running');
    assert.equal(jobOf(registry, 'second').status, 'queued');
    assert.equal(registry.countQueued(), 1);
});

test('an empty queue claims nothing', () => {
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'claimed');
    registry.claimOldestQueued();

    assert.equal(registry.claimOldestQueued(), undefined);
});

test('the log keeps the newest 500 lines', () => {
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'job');
    const lines: string[] = [];
    for (let number = 1; number <= 501; number++) {
        lines.push(`line ${number}`);
    }

    registry.appendLogLines('job', lines);

    const logLines: string[] = jobOf(registry, 'job').logLines;
    assert.equal(logLines.length, 500);
    assert.equal(logLines[0], 'line 2');
    assert.equal(logLines[499], 'line 501');
});

test('the first terminal status wins: a later report leaves a finished job as it is', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'job');
    registry.claimOldestQueued();

    registry.complete('job', 'failed', 'exit code 1');
    registry.complete('job', 'succeeded', undefined);

    const job: BuildJob = jobOf(registry, 'job');
    assert.equal(job.status, 'failed');
    assert.equal(job.errorMessage, 'exit code 1');
});

test('a finished job is forgotten after 30 minutes; queued and running jobs stay', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'finished');
    registry.claimOldestQueued();
    registry.complete('finished', 'succeeded', undefined);
    createJob(registry, 'running');
    registry.claimOldestQueued();
    createJob(registry, 'queued');

    t.mock.timers.tick(30 * MINUTE_MS - 1);
    assert.equal(jobOf(registry, 'finished').status, 'succeeded');

    t.mock.timers.tick(1);
    assert.equal(registry.get('finished'), undefined);
    assert.equal(jobOf(registry, 'running').status, 'running');
    assert.equal(jobOf(registry, 'queued').status, 'queued');
});

test('a running job the builder has not touched for longer than the limit is failed; a queued one is left alone', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const registry: BuildJobRegistry = new BuildJobRegistry();
    createJob(registry, 'running');
    registry.claimOldestQueued();
    createJob(registry, 'queued');

    t.mock.timers.tick(STALE_TIMEOUT_MS);
    registry.appendLogLines('running', ['still building']);
    t.mock.timers.tick(STALE_TIMEOUT_MS);
    registry.failStaleRunningJobs(STALE_TIMEOUT_MS);
    assert.equal(jobOf(registry, 'running').status, 'running');

    t.mock.timers.tick(1);
    registry.failStaleRunningJobs(STALE_TIMEOUT_MS);
    const job: BuildJob = jobOf(registry, 'running');
    assert.equal(job.status, 'failed');
    assert.equal(job.errorMessage, 'The builder went silent — the build was abandoned');
    assert.equal(jobOf(registry, 'queued').status, 'queued');
});

function createJob(registry: BuildJobRegistry, id: string): BuildJob {
    return registry.create(id, `image:${id}`, CLONE_URL, START_BUILD);
}

function jobOf(registry: BuildJobRegistry, id: string): BuildJob {
    const job: BuildJob | undefined = registry.get(id);
    assert.ok(job !== undefined, `no job "${id}"`);
    return job;
}
