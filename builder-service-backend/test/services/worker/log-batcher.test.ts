/**
 * The buffer between a chatty build and the platform's job log: one request a
 * second, at most 500 lines each, a lost job recorded instead of thrown, any
 * other failure costing only its lines. The platform is a
 * `RecordingPlatformApiClient`; the flush clock runs under mock timers.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { BuildJobLostError } from '../../../src/services/platform/build-job-lost-error.ts';
import { PlatformApiError } from '../../../src/services/platform/platform-api-error.ts';
import { LogBatcher } from '../../../src/services/worker/log-batcher.ts';
import { RecordingPlatformApiClient } from '../platform/fakes/recording-platform-api-client.ts';

const JOB_ID = 'job-1';
const SECOND_MS = 1_000;

test('buffered lines go to the platform in one request each second, in the order pushed', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);
    batcher.push('Step 1/2 : FROM nginx');
    batcher.push('Step 2/2 : COPY . .');

    t.mock.timers.tick(SECOND_MS - 1);
    await setImmediate();
    assert.deepEqual(platform.callsTo('appendBuildLogs'), []);

    t.mock.timers.tick(1);
    await setImmediate();
    batcher.push('Successfully built');
    t.mock.timers.tick(SECOND_MS);
    await setImmediate();

    assert.deepEqual(platform.callsTo('appendBuildLogs'), [
        [JOB_ID, ['Step 1/2 : FROM nginx', 'Step 2/2 : COPY . .']],
        [JOB_ID, ['Successfully built']],
    ]);
});

test('a second with nothing buffered sends nothing', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);

    t.mock.timers.tick(3 * SECOND_MS);
    await batcher.flush();

    assert.deepEqual(platform.calls, []);
});

test('more than 500 lines are sent in requests of at most 500, in order', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);
    const lines: string[] = numberedLines(1200);
    for (const line of lines) {
        batcher.push(line);
    }

    await batcher.flush();

    assert.deepEqual(platform.callsTo('appendBuildLogs'), [
        [JOB_ID, lines.slice(0, 500)],
        [JOB_ID, lines.slice(500, 1000)],
        [JOB_ID, lines.slice(1000)],
    ]);
});

test('a lost job is recorded, not thrown: the rest of the buffer is dropped and later lines are ignored', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);
    platform.failWith('appendBuildLogs', new BuildJobLostError(JOB_ID));
    const lines: string[] = numberedLines(600);
    for (const line of lines) {
        batcher.push(line);
    }
    assert.equal(batcher.isJobLost(), false);

    await batcher.flush();
    platform.clearFailure('appendBuildLogs');
    batcher.push('a line after the job was lost');
    await batcher.flush();

    assert.equal(batcher.isJobLost(), true);
    assert.deepEqual(platform.callsTo('appendBuildLogs'), [[JOB_ID, lines.slice(0, 500)]]);
});

test('any other failure costs only the lines of that request: the job is not lost and later lines still go', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    t.mock.method(console, 'warn', () => {});
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);
    platform.failWith('appendBuildLogs', new PlatformApiError('Platform is unreachable: connect ECONNREFUSED', null));
    batcher.push('a line the platform never got');

    await batcher.flush();
    platform.clearFailure('appendBuildLogs');
    batcher.push('a line after the outage');
    await batcher.flush();

    assert.equal(batcher.isJobLost(), false);
    assert.deepEqual(platform.callsTo('appendBuildLogs'), [
        [JOB_ID, ['a line the platform never got']],
        [JOB_ID, ['a line after the outage']],
    ]);
});

test('a stopped batcher no longer flushes on the clock', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    const batcher: LogBatcher = new LogBatcher(platform, JOB_ID);
    batcher.push('a line still buffered');

    batcher.stop();
    t.mock.timers.tick(5 * SECOND_MS);
    await setImmediate();

    assert.deepEqual(platform.calls, []);
});

function numberedLines(count: number): string[] {
    const lines: string[] = [];
    for (let index = 1; index <= count; index++) {
        lines.push(`line ${index}`);
    }
    return lines;
}
