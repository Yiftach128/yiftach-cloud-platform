/**
 * The built frontend served from the API's origin: real files as they are,
 * the app for every other path, never for a backend path, and nothing at all
 * when no directory is configured. Over HTTP in-process, mounted after an API
 * route of this file's own as `server.ts` mounts it; the files live in a temp
 * folder made for the test.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

import { Router } from 'express';

import { staticFrontend } from '../../src/middleware/static-frontend.ts';
import { HttpAppUnderTest } from '../routes/http-app-under-test.ts';

const INDEX_HTML = '<!doctype html><title>app</title>';
const APP_JS = 'console.log("app");';

test('a real file is served as itself, with its content type', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startWithBuiltFrontend(t);

    const response: Response = await fetch(app.url('/assets/app.js'));

    assert.equal(response.status, 200);
    assert.match(headerOf(response, 'content-type'), /javascript/);
    assert.equal(await response.text(), APP_JS);
});

test('any other GET answers index.html with 200, so a reload of a client-side route still loads the app', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startWithBuiltFrontend(t);

    const deepLink: Response = await fetch(app.url('/services/web'));

    assert.equal(deepLink.status, 200);
    assert.match(headerOf(deepLink, 'content-type'), /text\/html/);
    assert.equal(await deepLink.text(), INDEX_HTML);
});

test('paths under /api, /health and /mcp are never the app: an unknown API path stays a 404', async (t: TestContext) => {
    const app: HttpAppUnderTest = await startWithBuiltFrontend(t);

    const knownApiPath: Response = await fetch(app.url('/api/v1/ping'));
    const unknownApiPath: Response = await fetch(app.url('/api/v1/nope'));
    const health: Response = await fetch(app.url('/health'));
    const mcp: Response = await fetch(app.url('/mcp'));

    assert.equal(knownApiPath.status, 200);
    assert.equal(unknownApiPath.status, 404);
    assert.notEqual(await unknownApiPath.text(), INDEX_HTML);
    assert.equal(health.status, 404);
    assert.equal(mcp.status, 404);
});

test('an empty STATIC_DIR mounts nothing: the root answers 404', async (t: TestContext) => {
    const app: HttpAppUnderTest = await HttpAppUnderTest.start(t, [staticFrontend('')]);

    const root: Response = await fetch(app.url('/'));

    assert.equal(root.status, 404);
});

/** A built frontend (index.html + one asset) in a temp folder, behind one API route, as `server.ts` mounts them. */
async function startWithBuiltFrontend(t: TestContext): Promise<HttpAppUnderTest> {
    const directory: string = await mkdtemp(join(tmpdir(), 'ycp-static-frontend-'));
    t.after((): Promise<void> => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'index.html'), INDEX_HTML, 'utf8');
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'app.js'), APP_JS, 'utf8');

    const ping: Router = Router().get('/api/v1/ping', (_req, res): void => {
        res.json({ ok: true });
    });
    return HttpAppUnderTest.start(t, [ping, staticFrontend(directory)]);
}

function headerOf(response: Response, name: string): string {
    const value: string | null = response.headers.get(name);
    if (value === null) {
        throw new Error(`expected a ${name} header`);
    }
    return value;
}
