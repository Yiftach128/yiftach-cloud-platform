/**
 * One build task from claim to result when nothing goes wrong: what is cloned,
 * how the image is labeled, which ports the container gets, what the platform
 * is told and in which order, and what is left on the disk. The worker runs
 * with its own port resolver, heartbeat reporter and log batcher; the
 * platform, git and Docker are recording fakes.
 */

import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { test, type TestContext } from 'node:test';

import type { CloneRepositoryOptions } from '../../../../src/services/git/interfaces.ts';
import type { BuildImageOptions } from '../../../../src/services/docker/interfaces.ts';
import type { RecordedServiceCall } from '../../platform/fakes/interfaces.ts';
import {
    sampleBuildTask,
    SAMPLE_GIT_URL,
    SAMPLE_IMAGE_TAG,
    SAMPLE_JOB_ID,
} from '../../platform/sample-build-task.ts';
import { BuildWorkerWithFakes } from './build-worker-with-fakes.ts';

test('a claimed task is cloned, built, made into its container and reported succeeded', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);

    await harness.runOneTask(sampleBuildTask());

    const clone: CloneRepositoryOptions = onlyCloneOf(harness);
    const build: BuildImageOptions = onlyBuildOf(harness);
    assert.equal(clone.gitUrl, SAMPLE_GIT_URL);
    assert.equal(clone.gitRef, undefined);
    assert.equal(clone.timeoutMs, BuildWorkerWithFakes.GIT_CLONE_TIMEOUT_MS);
    assert.equal(build.contextDir, clone.targetDir);
    assert.equal(build.tag, SAMPLE_IMAGE_TAG);
    assert.deepEqual(harness.platform.callsTo('createContainer'), [[{
        name: 'web',
        image: SAMPLE_IMAGE_TAG,
        ports: [{ hostPort: 8080, containerPort: 80 }],
        env: { MODE: 'production' },
    }]]);
    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [[SAMPLE_JOB_ID, { status: 'succeeded' }]]);
});

test('the image is labeled with the repository page, the commit and the job; a build of the default branch gets no ref label', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.git.headCommit = 'c0ffee12'.repeat(5);

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(onlyBuildOf(harness).extraLabels, {
        'cloudplatform.repo-url': 'https://github.com/acme/web',
        'cloudplatform.commit': 'c0ffee12'.repeat(5),
        'cloudplatform.build-job-id': SAMPLE_JOB_ID,
    });
});

test('a task naming a ref clones that ref and labels the image with it', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);

    await harness.runOneTask(sampleBuildTask({ gitRef: 'release-2' }));

    assert.equal(onlyCloneOf(harness).gitRef, 'release-2');
    assert.equal(onlyBuildOf(harness).extraLabels['cloudplatform.git-ref'], 'release-2');
});

test("a task with ports publishes exactly those and never looks up the image's", async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.exposedPorts = [{ port: 3000, protocol: 'tcp' }];

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('getImageExposedPorts'), []);
    assert.deepEqual(harness.platform.callsTo('createContainer'), [[{
        name: 'web',
        image: SAMPLE_IMAGE_TAG,
        ports: [{ hostPort: 8080, containerPort: 80 }],
        env: { MODE: 'production' },
    }]]);
});

test("a task without ports publishes the built image's TCP EXPOSEs", async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.exposedPorts = [{ port: 3000, protocol: 'tcp' }];

    await harness.runOneTask(sampleBuildTask({ container: { name: 'web', ports: [], env: {} } }));

    assert.deepEqual(harness.platform.callsTo('getImageExposedPorts'), [[SAMPLE_IMAGE_TAG]]);
    assert.deepEqual(harness.platform.callsTo('createContainer'), [[{
        name: 'web',
        image: SAMPLE_IMAGE_TAG,
        ports: [{ hostPort: 3000, containerPort: 3000 }],
        env: {},
    }]]);
});

test('the whole progress log, build output included, reaches the platform before the result does', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.images.progressLines = ['#1 [1/2] FROM nginx:1.27', '#2 [2/2] COPY . /usr/share/nginx/html'];

    await harness.runOneTask(sampleBuildTask());

    const reports: RecordedServiceCall[] = harness.platform.calls.filter((call: RecordedServiceCall): boolean => {
        return call.method === 'appendBuildLogs' || call.method === 'reportBuildResult';
    });
    assert.deepEqual(reports, [
        {
            method: 'appendBuildLogs',
            arguments: [SAMPLE_JOB_ID, [
                'Cloning https://github.com/acme/web.git ...',
                `Cloned commit ${harness.git.headCommit}`,
                'Building image cloudplatform/build-acme-web:1a2b3c4d ...',
                '#1 [1/2] FROM nginx:1.27',
                '#2 [2/2] COPY . /usr/share/nginx/html',
                'Creating container "web" ...',
            ]],
        },
        { method: 'reportBuildResult', arguments: [SAMPLE_JOB_ID, { status: 'succeeded' }] },
    ]);
});

test('the agent reports building with the job id when the task starts, and idle when it ends', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);

    await harness.runOneTask(sampleBuildTask());

    assert.deepEqual(harness.platform.callsTo('sendAgentHeartbeat'), [
        [{
            name: BuildWorkerWithFakes.AGENT_NAME,
            status: 'building',
            startedAt: BuildWorkerWithFakes.STARTED_AT,
            currentJobId: SAMPLE_JOB_ID,
        }],
        [{ name: BuildWorkerWithFakes.AGENT_NAME, status: 'idle', startedAt: BuildWorkerWithFakes.STARTED_AT }],
    ]);
});

test('the clone workspace is made under the workspace folder and deleted once the build is done', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);

    await harness.runOneTask(sampleBuildTask());

    assert.equal(dirname(onlyCloneOf(harness).targetDir), harness.workspaceDir);
    assert.deepEqual(await harness.workspaceEntries(), []);
});

test('a stop requested while a task is in flight lets it finish, and the next queued task is left unclaimed', async (t: TestContext) => {
    const harness: BuildWorkerWithFakes = await BuildWorkerWithFakes.start(t);
    harness.platform.tasks.push(sampleBuildTask({ jobId: 'job-1' }));
    harness.platform.tasks.push(sampleBuildTask({ jobId: 'job-2' }));

    const running: Promise<void> = harness.worker.run();
    harness.worker.requestStop();
    await running;

    assert.deepEqual(harness.platform.callsTo('reportBuildResult'), [['job-1', { status: 'succeeded' }]]);
    assert.equal(harness.platform.callsTo('claimBuildTask').length, 1);
    assert.equal(harness.platform.tasks.length, 1);
});

function onlyCloneOf(harness: BuildWorkerWithFakes): CloneRepositoryOptions {
    const clone: CloneRepositoryOptions | undefined = harness.git.cloneCalls[0];
    if (clone === undefined || harness.git.cloneCalls.length !== 1) {
        throw new Error(`expected one clone, got ${harness.git.cloneCalls.length}`);
    }
    return clone;
}

function onlyBuildOf(harness: BuildWorkerWithFakes): BuildImageOptions {
    const build: BuildImageOptions | undefined = harness.images.builds[0];
    if (build === undefined || harness.images.builds.length !== 1) {
        throw new Error(`expected one build, got ${harness.images.builds.length}`);
    }
    return build;
}
