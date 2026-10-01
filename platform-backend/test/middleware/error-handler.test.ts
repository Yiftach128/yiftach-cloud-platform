/**
 * The one place service errors become HTTP: the status each error class gets
 * and the `{message}` body, the counterpart of the MCP tools' error mapping.
 * Over HTTP in-process: a route of this file's own throws what the test hands
 * it, and the real handler answers; nothing else is involved.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { Router } from 'express';

import { AiAgentBusyError } from '../../src/services/ai-agent/ai-agent-busy-error.ts';
import { ToolCallApprovalNotPendingError } from '../../src/services/ai-agent/tool-call-approval-not-pending-error.ts';
import { BuildJobNotFoundError } from '../../src/services/builds/build-job-not-found-error.ts';
import { BuildQueueFullError } from '../../src/services/builds/build-queue-full-error.ts';
import { DockerApiError } from '../../src/services/docker/docker-api-error.ts';
import { DockerConnectionError } from '../../src/services/docker/docker-connection-error.ts';
import { ImageNotManagedError } from '../../src/services/docker/image-not-managed-error.ts';
import { ImagePullError } from '../../src/services/docker/image-pull-error.ts';
import { ValidationError } from '../../src/services/validation/validation-error.ts';
import { HttpAppUnderTest } from '../routes/http-app-under-test.ts';

test("a request parser's refusal is 400 with its message; a body that is not JSON is 400 in the handler's own words", async (t: TestContext) => {
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [
        Router().post('/echo', (req, res): void => {
            res.json(req.body);
        }),
    ]);

    const notJson: Response = await app.request('POST', '/echo', '{"turns": [');

    assert.deepEqual(await answerTo(t, new ValidationError('"name" must be a string')), { status: 400, message: '"name" must be a string' });
    assert.equal(notJson.status, 400);
    assert.deepEqual(await notJson.json(), { message: 'Request body is not valid JSON' });
});

test('a missing image or build job is 404; an unmanaged image or an approval nobody waits for is 409; a full queue or a busy assistant is 429', async (t: TestContext) => {
    assert.equal((await answerTo(t, new ImagePullError('nginx:nope', 'manifest unknown'))).status, 404);
    assert.equal((await answerTo(t, new BuildJobNotFoundError('job-7'))).status, 404);
    assert.equal((await answerTo(t, new ImageNotManagedError('nginx:1.27'))).status, 409);
    assert.equal((await answerTo(t, new ToolCallApprovalNotPendingError(1))).status, 409);
    assert.equal((await answerTo(t, new BuildQueueFullError(10))).status, 429);
    assert.equal((await answerTo(t, new AiAgentBusyError())).status, 429);
});

test("the daemon's own refusal keeps its status; an unreachable daemon is 503", async (t: TestContext) => {
    assert.deepEqual(
        await answerTo(t, new DockerApiError('No such container: web', 404, 'GET /containers/web/json')),
        { status: 404, message: 'No such container: web' },
    );
    assert.equal((await answerTo(t, new DockerApiError('conflict: container is running', 409, 'DELETE /containers/web'))).status, 409);
    const unreachable: { status: number; message: string } = await answerTo(
        t,
        new DockerConnectionError('http://127.0.0.1:2375', new Error('ECONNREFUSED')),
    );
    assert.equal(unreachable.status, 503);
    assert.match(unreachable.message, /^Cannot reach the Docker daemon at http:\/\/127\.0\.0\.1:2375\./);
});

test('anything else is 500 with its message; a thrown non-Error is rendered as text', async (t: TestContext) => {
    assert.deepEqual(await answerTo(t, new RangeError('out of range')), { status: 500, message: 'out of range' });
    assert.deepEqual(await answerTo(t, 'just a string'), { status: 500, message: 'just a string' });
});

/** The status and message a route throwing `failure` is answered with. */
async function answerTo(t: TestContext, failure: unknown): Promise<{ status: number; message: string }> {
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [
        Router().get('/fail', (): void => {
            throw failure;
        }),
    ]);
    const response: Response = await fetch(app.url('/fail'));
    const body: { message: string } = await HttpAppUnderTest.readJson(response);
    return { status: response.status, message: body.message };
}
