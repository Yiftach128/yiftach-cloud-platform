import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';

import express, { type Express, type RequestHandler } from 'express';

import { errorHandler } from '../../src/middleware/error-handler.ts';

/**
 * An Express app listening on a free loopback port for one test, mounted in
 * `server.ts`'s order: an optional gate (the host check) first, then the JSON
 * body parser, the handlers under test, and the real error handler last. The
 * tests reach it with `fetch`; it is closed when the test ends, open
 * connections included.
 */
export class HttpAppUnderTest {
    readonly baseUrl: string;

    private constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    static async start(t: TestContext, handlers: RequestHandler[], gate?: RequestHandler): Promise<HttpAppUnderTest> {
        const app: Express = express();
        if (gate !== undefined) {
            app.use(gate);
        }
        app.use(express.json());
        for (const handler of handlers) {
            app.use(handler);
        }
        app.use(errorHandler);

        const server: Server = await new Promise<Server>((resolve) => {
            const listening: Server = app.listen(0, '127.0.0.1', (): void => resolve(listening));
        });
        t.after((): Promise<void> => new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close((): void => resolve());
        }));

        const address: string | AddressInfo | null = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('HttpAppUnderTest: expected a TCP address');
        }
        return new HttpAppUnderTest(`http://127.0.0.1:${address.port}`);
    }

    url(path: string): string {
        return `${this.baseUrl}${path}`;
    }

    /** The response body as JSON, typed by the test; `fetch` itself only promises `unknown`. */
    static async readJson<T>(response: Response): Promise<T> {
        const body: unknown = await response.json();
        return body as T;
    }

    /** A JSON request; `body` is sent as given, so a string stands for a malformed body. */
    request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
        let payload: string | undefined;
        if (body === undefined) {
            payload = undefined;
        } else if (typeof body === 'string') {
            payload = body;
        } else {
            payload = JSON.stringify(body);
        }
        return fetch(this.url(path), {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            signal: signal,
        });
    }
}
