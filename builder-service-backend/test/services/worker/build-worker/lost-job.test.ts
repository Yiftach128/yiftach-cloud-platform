/**
 * A build whose job the platform forgot (it restarted): the worker abandons
 * the task at the next milestone and tells the platform nothing more, since
 * there is no job left to tell it about. The lost job is an injected
 * `BuildJobLostError` on the recording platform fake; the log batcher's flush
 * clock runs under mock timers, advanced from inside the fake build.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { BuildJobLostError } from '../../../../src/services/platform/build-job-lost-error.ts';
import { sampleBuildTask, SAMPLE_JOB_ID } from '../../platform/sample-build-task.ts';
import { BuildWorkerWithFakes } from './build-worker-with-fakes.ts';

const LOG_FLUSH_INTERVAL_MS = 1_000;

test('a job lost while the image builds is abandoned before the container is created, with no result reported', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.failWith('appendBuildLogs', new BuildJobLostError(SAMPLE_JOB_ID));
    harness.images.duringBuild = (): Promise<void> => letTheTimedLogFlushRun(t);

    await harness.runOneTask(sampleBuildTask());

    assert.equal(harness.images.builds.length, 1);
    assert.deepEqual(harness.platform.callsTo('createContainer'), []);
    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), []);
});

test('a job lost when its result is reported is not reported again as failed', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.failWith('reportBuildResult', new BuildJobLostError(SAMPLE_JOB_ID));

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, { status: 'succeeded' }]]);
});

test('after an abandon the clone workspace is deleted and the agent reports idle', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.failWith('appendBuildLogs', new BuildJobLostError(SAMPLE_JOB_ID));
    harness.images.duringBuild = (): Promise<void> => letTheTimedLogFlushRun(t);

    await harness.runOneTask(sampleBuildTask());

    const beats: unknown[][] = harness.platform.callsTo('sendAgentHeartbeat');
    assert.deepEqual(await harness.workspaceEntries(), []);
    assert.deepEqual(beats[beats.length - 1], [{
        name: BuildWorkerWithFakes.AGENT_NAME,
        status: 'idle',
        startedAt: BuildWorkerWithFakes.STARTED_AT,
    }]);
});

/** Advances the clock past one log flush and lets that flush's answer land, as a long build would. */
async function letTheTimedLogFlushRun(t: TestContext): Promise<void> {
    t.mock.timers.tick(LOG_FLUSH_INTERVAL_MS);
    await setImmediate();
}
