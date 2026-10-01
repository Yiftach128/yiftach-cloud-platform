/**
 * DELETE /containers/:id: the two query flags reach the service as booleans,
 * false when absent, and a removal answers 204 with no body. Over HTTP
 * in-process, on `RecordingContainerService`.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { deleteContainerRoute } from '../../src/routes/delete-container.ts';
import { RecordingContainerService } from '../services/docker/fakes/recording-container-service.ts';
import { HttpAppUnderTest } from './http-app-under-test.ts';

test('"?force=true&volumes=true" reach the service as flags; absent flags are false; a removal is 204 with no body', async (t: TestContext) => {
    const docker: RecordingContainerService = new RecordingContainerService();
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [deleteContainerRoute(docker)]);

    const forced: Response = await app.request('DELETE', '/containers/web?force=true&volumes=true');
    const plain: Response = await app.request('DELETE', '/containers/web');

    assert.equal(forced.status, 204);
    assert.equal(await forced.text(), '');
    assert.equal(plain.status, 204);
    assert.deepEqual(docker.calls, [
        { method: 'deleteContainer', arguments: ['web', { force: true, removeVolumes: true }] },
        { method: 'deleteContainer', arguments: ['web', { force: false, removeVolumes: false }] },
    ]);
});
