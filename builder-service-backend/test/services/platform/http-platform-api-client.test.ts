/**
 * What the builder's platform client makes of the platform's answers: an
 * empty queue, a job the platform forgot, a refusal, an unreachable platform,
 * and the routes it posts to. The client is real, over axios; the platform is
 * a stand-in server on a free port, scripted by each test.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { HttpPlatformApiClient } from '../../../src/services/platform/http-platform-api-client.ts';
import type { BuildTask, ImageExposedPort } from '../../../src/services/platform/interfaces.ts';
import { sampleBuildTask, SAMPLE_IMAGE_TAG, SAMPLE_JOB_ID } from './sample-build-task.ts';
import { StandInPlatformServer } from './stand-in-platform-server.ts';

const API_PATH = '/api/v1';

test('an empty queue (204) is answered as no task; a queued build as the task', async (t: TestContext) => {
    const server: StandInPlatformServer = await StandInPlatformServer.start(t);
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    const task: BuildTask = sampleBuildTask();
    server.respondWithStatus(204);
    server.respondWithJson(200, task);

    const nothing: BuildTask | null = await client.claimBuildTask();
    const claimed: BuildTask | null = await client.claimBuildTask();

    assert.equal(nothing, null);
    assert.deepEqual(claimed, task);
});

test('a 404 on a log append or a result report is a lost job', async (t: TestContext) => {
    const server: StandInPlatformServer = await StandInPlatformServer.start(t);
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    server.respondWithJson(404, { message: 'No such build job' });
    server.respondWithJson(404, { message: 'No such build job' });

    await assert.rejects(client.appendBuildLogs(SAMPLE_JOB_ID, ['Cloning ...']), {
        name: 'BuildJobLostError',
        message: 'Build job job-1 no longer exists on the platform',
    });
    await assert.rejects(client.reportBuildResult(SAMPLE_JOB_ID, { status: 'succeeded' }), {
        name: 'BuildJobLostError',
        message: 'Build job job-1 no longer exists on the platform',
    });
});

test('a 404 on the exposed-ports lookup is an ordinary platform error, not a lost job', async (t: TestContext) => {
    const server: StandInPlatformServer = await StandInPlatformServer.start(t);
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    server.respondWithJson(404, { message: 'No such image: cloudplatform/build-acme-web:1a2b3c4d' });

    await assert.rejects(client.getImageExposedPorts(SAMPLE_IMAGE_TAG), {
        name: 'PlatformApiError',
        message: 'No such image: cloudplatform/build-acme-web:1a2b3c4d',
        status: 404,
    });
});

test("a refusal carries the platform's own message and status; a body without a message names the status", async (t: TestContext) => {
    const server: StandInPlatformServer = await StandInPlatformServer.start(t);
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    server.respondWithJson(409, { message: 'Bind for 0.0.0.0:8080 failed: port is already allocated' });
    server.respondWithStatus(502);

    await assert.rejects(client.createContainer({ name: 'web', image: SAMPLE_IMAGE_TAG, ports: [], env: {} }), {
        name: 'PlatformApiError',
        message: 'Bind for 0.0.0.0:8080 failed: port is already allocated',
        status: 409,
    });
    await assert.rejects(client.getContainers(), {
        name: 'PlatformApiError',
        message: 'Platform request failed with status 502',
        status: 502,
    });
});

test('an unreachable platform is a platform error with no status', async () => {
    const server: StandInPlatformServer = new StandInPlatformServer();
    await server.listen();
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    await server.stop();

    await assert.rejects(client.claimBuildTask(), {
        name: 'PlatformApiError',
        message: /^Platform is unreachable: /,
        status: null,
    });
});

test("log lines and the result go to the job's own routes, and an image reference is URL-encoded into its path", async (t: TestContext) => {
    const server: StandInPlatformServer = await StandInPlatformServer.start(t);
    const client: HttpPlatformApiClient = new HttpPlatformApiClient(server.baseUrl + API_PATH);
    const exposed: ImageExposedPort[] = [{ port: 80, protocol: 'tcp' }];
    server.respondWithStatus(204);
    server.respondWithStatus(204);
    server.respondWithJson(200, exposed);

    await client.appendBuildLogs(SAMPLE_JOB_ID, ['Cloning ...', 'Cloned commit 4f2a9c1e']);
    await client.reportBuildResult(SAMPLE_JOB_ID, { status: 'failed', errorMessage: 'no Dockerfile' });
    const ports: ImageExposedPort[] = await client.getImageExposedPorts(SAMPLE_IMAGE_TAG);

    assert.deepEqual(ports, exposed);
    assert.deepEqual(server.requests, [
        {
            method: 'POST',
            path: '/api/v1/builds-queue/job-1/logs',
            body: { lines: ['Cloning ...', 'Cloned commit 4f2a9c1e'] },
        },
        {
            method: 'POST',
            path: '/api/v1/builds-queue/job-1/result',
            body: { status: 'failed', errorMessage: 'no Dockerfile' },
        },
        {
            method: 'GET',
            path: '/api/v1/images/cloudplatform%2Fbuild-acme-web%3A1a2b3c4d/exposed-ports',
            body: '',
        },
    ]);
});
