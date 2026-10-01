/**
 * The reader of the daemon's progress streams (pulls and builds): the lines
 * it forwards, the failure the daemon reports inside a 200 stream, and the
 * idle watchdog that is the only hung-daemon protection on the image
 * service's timeout-less client. dockerode's `followProgress` is replaced by
 * `ManualProgressFeed`; the clock runs under mock timers.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { drainProgressStream } from '../../../src/services/docker/drain-progress-stream.ts';
import { ManualProgressFeed } from './fakes/manual-progress-feed.ts';

const IDLE_TIMEOUT_MS = 300_000;

test('stream text is forwarded line by line without trailing whitespace; a status reads "id: status"; byte-counter updates are skipped', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const feed: ManualProgressFeed = new ManualProgressFeed();
    const lines: string[] = [];
    const drained: Promise<void> = drainProgressStream(feed.follow, feed.stream, (line: string): void => {
        lines.push(line);
    });

    feed.emit({ stream: 'Step 1/3 : FROM nginx\n ---> abc123  \n\n' });
    feed.emit({ status: 'Pulling fs layer', id: 'a1b2' });
    feed.emit({ status: 'Downloading', id: 'a1b2', progress: '[=====>    ] 1MB/5MB' });
    feed.emit({ status: 'Pull complete', id: 'a1b2' });
    feed.emit({ status: 'Status: Downloaded newer image for nginx:1.27' });
    feed.end();
    await drained;

    assert.deepEqual(lines, [
        'Step 1/3 : FROM nginx',
        ' ---> abc123',
        'a1b2: Pulling fs layer',
        'a1b2: Pull complete',
        'Status: Downloaded newer image for nginx:1.27',
    ]);
});

test('an {"error"} event inside a 200 stream fails the drain with the detail message, or the error text when there is none', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const detailed: ManualProgressFeed = new ManualProgressFeed();
    const bare: ManualProgressFeed = new ManualProgressFeed();
    const lines: string[] = [];
    const detailedDrain: Promise<void> = drainProgressStream(detailed.follow, detailed.stream, (line: string): void => {
        lines.push(line);
    });
    const bareDrain: Promise<void> = drainProgressStream(bare.follow, bare.stream, (line: string): void => {
        lines.push(line);
    });

    detailed.emit({ error: 'pull failed', errorDetail: { message: 'manifest unknown: nginx:nope' } });
    detailed.emit({ status: 'after the failure' });
    bare.emit({ error: 'pull failed' });

    await assert.rejects(detailedDrain, { message: 'manifest unknown: nginx:nope' });
    await assert.rejects(bareDrain, { message: 'pull failed' });
    assert.deepEqual(lines, []);
});

test('five minutes of silence destroys the stream and fails the drain; every event restarts the clock', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const feed: ManualProgressFeed = new ManualProgressFeed();
    const drained: Promise<void> = drainProgressStream(feed.follow, feed.stream, (): void => {});

    t.mock.timers.tick(IDLE_TIMEOUT_MS - 1000);
    feed.emit({ status: 'Downloading', id: 'a1b2', progress: '[=>        ] 1MB/5MB' });
    t.mock.timers.tick(IDLE_TIMEOUT_MS - 1000);
    assert.equal(feed.stream.destroyed, false);

    t.mock.timers.tick(1000);

    assert.equal(feed.stream.destroyed, true);
    await assert.rejects(drained, { message: 'the daemon sent no progress for 300s' });
});

test('a clean end resolves the drain and disarms the watchdog', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const feed: ManualProgressFeed = new ManualProgressFeed();
    const drained: Promise<void> = drainProgressStream(feed.follow, feed.stream, (): void => {});

    feed.end();
    await drained;
    t.mock.timers.tick(IDLE_TIMEOUT_MS);

    assert.equal(feed.stream.destroyed, false);
});
