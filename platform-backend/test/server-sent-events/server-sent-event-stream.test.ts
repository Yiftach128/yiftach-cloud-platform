/**
 * One response as an event stream: the headers go out at `open()`, before
 * any event; each `send` is one `event:` line and one JSON `data:` line; and
 * once the response is over, `send` and `close` do nothing rather than raise
 * the unhandled stream error a write after the end would. Over HTTP
 * in-process, on a route of this file's own.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { Router, type Request, type Response as ExpressResponse } from 'express';

import { ServerSentEventStream } from '../../src/server-sent-events/server-sent-event-stream.ts';
import { HttpAppUnderTest } from '../routes/http-app-under-test.ts';

test('open() sends the headers at once, before the first event; each event is its name and one JSON data line', async (t: TestContext) => {
    let headersSentAtOpen: boolean = false;
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [
        Router().get('/events', (_req: Request, res: ExpressResponse): void => {
            const stream: ServerSentEventStream = new ServerSentEventStream(res);
            stream.open();
            headersSentAtOpen = res.headersSent;
            stream.send('delta', { type: 'delta', text: 'hi' });
            stream.send('done', { type: 'done', modelCalls: 1 });
            stream.close();
        }),
    ]);

    const response: Response = await fetch(app.url('/events'));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(headersSentAtOpen, true);
    assert.equal(
        await response.text(),
        'event: delta\ndata: {"type":"delta","text":"hi"}\n\nevent: done\ndata: {"type":"done","modelCalls":1}\n\n',
    );
});

test('once the response is over, a late send and a second close do nothing instead of raising a write-after-end error', async (t: TestContext) => {
    const responseErrors: Error[] = [];
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [
        Router().get('/events', (_req: Request, res: ExpressResponse): void => {
            res.on('error', (error: Error): void => {
                responseErrors.push(error);
            });
            const stream: ServerSentEventStream = new ServerSentEventStream(res);
            stream.open();
            stream.send('delta', { type: 'delta', text: 'first' });
            stream.close();
            stream.send('delta', { type: 'delta', text: 'too late' });
            stream.close();
        }),
    ]);

    const response: Response = await fetch(app.url('/events'));
    const body: string = await response.text();
    await setImmediate();

    assert.equal(body, 'event: delta\ndata: {"type":"delta","text":"first"}\n\n');
    assert.deepEqual(responseErrors, []);
});
