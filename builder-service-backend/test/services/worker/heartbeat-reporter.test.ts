/**
 * The builder's presence report: a beat at start and one every interval, an
 * immediate beat whenever it turns to building or back to idle, and a failed
 * send that never surfaces. The platform is a `RecordingPlatformApiClient`;
 * the interval and the clock run under mock timers.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { PlatformApiError } from '../../../src/services/platform/platform-api-error.ts';
import { HeartbeatReporter } from '../../../src/services/worker/heartbeat-reporter.ts';
import type { HeartbeatReporterOptions } from '../../../src/services/worker/interfaces.ts';
import { RecordingPlatformApiClient } from '../platform/fakes/recording-platform-api-client.ts';

const NOW: number = Date.parse('2026-10-02T10:00:00.000Z');
const STARTED_AT = '2026-10-02T10:00:00.000Z';
const INTERVAL_MS = 10_000;
const OPTIONS: HeartbeatReporterOptions = { agentName: 'builder-1', heartbeatIntervalMs: INTERVAL_MS };
const IDLE_BEAT = { name: 'builder-1', status: 'idle', startedAt: STARTED_AT };

test('start sends a beat at once, then one every interval, until stopped', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: NOW });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const reporter: HeartbeatReporter = new HeartbeatReporter(platform, OPTIONS);

    reporter.start();
    assert.deepEqual(platform.callsTo('sendAgentHeartbeat'), [[IDLE_BEAT]]);

    t.mock.timers.tick(INTERVAL_MS - 1);
    assert.equal(platform.callsTo('sendAgentHeartbeat').length, 1);

    t.mock.timers.tick(1);
    t.mock.timers.tick(INTERVAL_MS);
    assert.deepEqual(platform.callsTo('sendAgentHeartbeat'), [[IDLE_BEAT], [IDLE_BEAT], [IDLE_BEAT]]);

    reporter.stop();
    t.mock.timers.tick(3 * INTERVAL_MS);
    assert.equal(platform.callsTo('sendAgentHeartbeat').length, 3);
});

test('a second start neither beats again nor adds a second timer', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: NOW });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const reporter: HeartbeatReporter = new HeartbeatReporter(platform, OPTIONS);

    reporter.start();
    reporter.start();
    assert.equal(platform.callsTo('sendAgentHeartbeat').length, 1);

    t.mock.timers.tick(INTERVAL_MS);
    assert.equal(platform.callsTo('sendAgentHeartbeat').length, 2);
});

test('turning to building and back to idle each beat at once; the job id travels only while building', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: NOW });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const reporter: HeartbeatReporter = new HeartbeatReporter(platform, OPTIONS);

    reporter.setBuilding('job-7');
    reporter.setIdle();

    assert.deepEqual(platform.callsTo('sendAgentHeartbeat'), [
        [{ name: 'builder-1', status: 'building', startedAt: STARTED_AT, currentJobId: 'job-7' }],
        [IDLE_BEAT],
    ]);
});

test('every beat carries the time the reporter was built, however much later it is sent', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: NOW });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const reporter: HeartbeatReporter = new HeartbeatReporter(platform, OPTIONS);

    t.mock.timers.tick(90 * 60 * 1000);
    reporter.setBuilding('job-7');

    assert.deepEqual(platform.callsTo('sendAgentHeartbeat'), [
        [{ name: 'builder-1', status: 'building', startedAt: STARTED_AT, currentJobId: 'job-7' }],
    ]);
});

test('a beat the platform does not take is swallowed, and the next one is still sent', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: NOW });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const reporter: HeartbeatReporter = new HeartbeatReporter(platform, OPTIONS);
    platform.failWith('sendAgentHeartbeat', new PlatformApiError('Platform is unreachable: connect ECONNREFUSED', null));

    reporter.start();
    t.mock.timers.tick(INTERVAL_MS);
    // An unhandled rejection would fail the test here.
    await setImmediate();

    assert.equal(platform.callsTo('sendAgentHeartbeat').length, 2);
});
