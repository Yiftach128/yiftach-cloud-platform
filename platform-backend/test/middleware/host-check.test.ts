/**
 * The gate in front of everything: which `Host` and `Origin` headers get a
 * request past it, since the API has no login and controls Docker. Over HTTP
 * in-process, in front of a route of this file's own. The requests go out
 * through `node:http` rather than `fetch`, which refuses to let a caller set
 * the `Host` header.
 */

import assert from 'node:assert/strict';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { test, type TestContext } from 'node:test';

import { Router } from 'express';

import { hostCheck } from '../../src/middleware/host-check.ts';
import { HttpAppUnderTest } from '../routes/http-app-under-test.ts';

test('a Host outside the list is refused with 403 naming it; ports are ignored and names are compared case-insensitively', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startBehind('localhost, Platform', t);

    assert.deepEqual(await answerTo(app, { host: 'evil.example:3000' }), { status: 403, message: 'Host "evil.example" is not allowed' });
    assert.equal((await answerTo(app, { host: 'LOCALHOST:5173' })).status, 200);
    assert.equal((await answerTo(app, { host: 'platform' })).status, 200);
});

test('an Origin outside the list is refused under an allowed Host; a request without one passes on Host alone; the "null" origin is refused', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startBehind('localhost', t);

    assert.deepEqual(
        await answerTo(app, { host: 'localhost:3000', origin: 'http://evil.example' }),
        { status: 403, message: 'Origin "http://evil.example" is not allowed' },
    );
    assert.equal((await answerTo(app, { host: 'localhost:3000' })).status, 200);
    assert.equal((await answerTo(app, { host: 'localhost:3000', origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await answerTo(app, { host: 'localhost:3000', origin: 'null' })).status, 403);
});

test('an IPv6 literal keeps its brackets, so "[::1]" is what the list must hold', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startBehind('[::1]', t);

    assert.equal((await answerTo(app, { host: '[::1]:3000' })).status, 200);
    assert.equal((await answerTo(app, { host: '::1' })).status, 403);
});

/** An app answering GET /ping with 200 behind the host check for `allowedHosts`. */
function startBehind(allowedHosts: string, t: TestContext): Promise<HttpAppUnderTest> {
    const ping: Router = Router().get('/ping', (_req, res): void => {
        res.json({ ok: true });
    });
    return HttpAppUnderTest.start(t, [ping], hostCheck(allowedHosts));
}

/** GET /ping with exactly these headers; the message is the refusal's, undefined on a pass. */
function answerTo(app: HttpAppUnderTest, headers: Record<string, string>): Promise<{ status: number; message?: string }> {
    return new Promise((resolve, reject) => {
        const outgoing = httpRequest(app.url('/ping'), { method: 'GET', headers: headers }, (incoming: IncomingMessage): void => {
            let body: string = '';
            incoming.setEncoding('utf8');
            incoming.on('data', (chunk: string): void => {
                body = body + chunk;
            });
            incoming.on('end', (): void => {
                const parsed: { message?: string } = JSON.parse(body);
                if (incoming.statusCode === undefined) {
                    reject(new Error('no status code'));
                } else if (parsed.message === undefined) {
                    resolve({ status: incoming.statusCode });
                } else {
                    resolve({ status: incoming.statusCode, message: parsed.message });
                }
            });
        });
        outgoing.on('error', reject);
        outgoing.end();
    });
}
