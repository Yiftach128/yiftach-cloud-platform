/**
 * A build task that fails: the user reads the reason in the job, the steps
 * after the failure never run, and the worker itself survives, cleans up and
 * turns idle. The failures are injected into the recording fakes of the
 * platform, git and Docker; the worker and its own helpers are real.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { GitCloneError } from '../../../../src/services/git/git-clone-error.ts';
import { PlatformApiError } from '../../../../src/services/platform/platform-api-error.ts';
import { sampleBuildTask, SAMPLE_GIT_URL, SAMPLE_JOB_ID } from '../../platform/sample-build-task.ts';
import { BuildWorkerWithFakes } from './build-worker-with-fakes.ts';

test("a failed clone is reported as failed with git's message, and nothing is built", async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.git.failWith('cloneRepository', new GitCloneError(SAMPLE_GIT_URL, 'repository not found'));

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, {
        status: 'failed',
        errorMessage: 'Cloning https://github.com/acme/web.git failed: repository not found',
    }]]);
    assert.deepEqual(harness.images.builds, []);
    assert.deepEqual(harness.platform.callsTo('createContainer'), []);
});

test('a failed build is reported as failed with its message, and no container is created', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.images.failWith(new Error('dockerfile parse error on line 3: unknown instruction: RUNN'));

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, {
        status: 'failed',
        errorMessage: 'dockerfile parse error on line 3: unknown instruction: RUNN',
    }]]);
    assert.deepEqual(harness.platform.callsTo('createContainer'), []);
});

test("a container the platform refuses to create is reported as failed with the platform's message, after the log so far", async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.failWith('createContainer', new PlatformApiError('Bind for 0.0.0.0:8080 failed: port is already allocated', 409));

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('appendBuildLogs'), [[SAMPLE_JOB_ID, [
        'Cloning https://github.com/acme/web.git ...',
        `Cloned commit ${harness.git.headCommit}`,
        'Building image cloudplatform/build-acme-web:1a2b3c4d ...',
        'Creating container "web" ...',
    ]]]);
    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, {
        status: 'failed',
        errorMessage: 'Bind for 0.0.0.0:8080 failed: port is already allocated',
    }]]);
});

test('a failure report the platform does not take does not stop the worker', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.images.failWith(new Error('no Dockerfile in the repository'));
    harness.platform.failWith('reportBuildResult', new PlatformApiError('Platform is unreachable: connect ECONNREFUSED', null));

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, {
        status: 'failed',
        errorMessage: 'no Dockerfile in the repository',
    }]]);
});

test('after a failure the clone workspace is deleted and the agent reports idle', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.images.failWith(new Error('no Dockerfile in the repository'));

    await harness.runOneTask(sampleBuildTask());

    const beats: unknown[][] = harness.platform.callsTo('sendAgentHeartbeat');
    assert.deepEqual(await harness.workspaceEntries(), []);
    assert.deepEqual(beats[beats.length - 1], [{
        name: BuildWorkerWithFakes.AGENT_NAME,
        status: 'idle',
        startedAt: BuildWorkerWithFakes.STARTED_AT,
    }]);
});
