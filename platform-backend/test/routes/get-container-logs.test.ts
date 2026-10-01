/**
 * GET /containers/:id/logs: how the two query parameters reach the service —
 * `tail` as a count, "all", or left to the service's default, `since` checked
 * to be a date but forwarded as the text it came in, so the daemon's
 * nanoseconds survive. Over HTTP in-process, on `RecordingContainerService`.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { getContainerLogsRoute } from '../../src/routes/get-container-logs.ts';
import type { RecordedServiceCall } from '../services/docker/fakes/interfaces.ts';
import { RecordingContainerService } from '../services/docker/fakes/recording-container-service.ts';
import { HttpAppUnderTest } from './http-app-under-test.ts';

test('tail is passed as a count or "all", and left to the service when absent or not a positive whole number', async (t: TestContext) => {
    const docker: RecordingContainerService = new RecordingContainerService();
    docker.logs = { tty: false, lines: [{ stream: 'stdout', timestamp: '2026-09-30T08:00:00.000000000Z', text: 'started' }] };
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [getContainerLogsRoute(docker)]);

    const absent: Response = await fetch(app.url('/containers/web/logs'));
    await fetch(app.url('/containers/web/logs?tail=20'));
    await fetch(app.url('/containers/web/logs?tail=all'));
    await fetch(app.url('/containers/web/logs?tail=-5'));
    await fetch(app.url('/containers/web/logs?tail=twenty'));

    assert.equal(absent.status, 200);
    assert.deepEqual(await absent.json(), docker.logs);
    assert.deepEqual(docker.calls.map(optionsOf), [
        { tail: undefined, since: undefined },
        { tail: 20, since: undefined },
        { tail: 'all', since: undefined },
        { tail: undefined, since: undefined },
        { tail: undefined, since: undefined },
    ]);
});

test('since is checked to be a date but forwarded verbatim, so the nanoseconds survive; a value that is not a date is dropped', async (t: TestContext) => {
    const docker: RecordingContainerService = new RecordingContainerService();
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [getContainerLogsRoute(docker)]);

    await fetch(app.url('/containers/web/logs?since=2026-09-30T08:00:00.123456789Z'));
    await fetch(app.url('/containers/web/logs?since=yesterday'));

    assert.deepEqual(docker.calls.map(optionsOf), [
        { tail: undefined, since: '2026-09-30T08:00:00.123456789Z' },
        { tail: undefined, since: undefined },
    ]);
});

/** The options the route handed `getContainerLogs`. */
function optionsOf(call: RecordedServiceCall): unknown {
    assert.equal(call.method, 'getContainerLogs');
    return call.arguments[1];
}
