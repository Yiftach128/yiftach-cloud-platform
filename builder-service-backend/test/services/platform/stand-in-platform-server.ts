import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';

import type { StandInRequest, StandInResponse } from './interfaces.ts';

/**
 * Stands in for the platform API on `127.0.0.1`, a free port: answers each
 * request with the response the test scripted next (FIFO) and keeps every
 * request it got. It knows nothing of the platform's routes or rules; a test
 * scripts the exact status and body.
 */
export class StandInPlatformServer {
    /** Every request received, in order, with its parsed JSON body. */
    readonly requests: StandInRequest[] = [];
    baseUrl: string = '';
    private readonly server: Server;
    private readonly scriptedResponses: StandInResponse[] = [];

    constructor() {
        this.server = createServer((request: IncomingMessage, response: ServerResponse): void => {
            void this.answer(request, response);
        });
    }

    /** A started server whose `stop` is registered on the test, so a failed test frees the port too. */
    static async start(t: TestContext): Promise<StandInPlatformServer> {
        const server: StandInPlatformServer = new StandInPlatformServer();
        await server.listen();
        t.after((): Promise<void> => server.stop());
        return server;
    }

    async listen(): Promise<void> {
        await new Promise<void>((resolve: () => void): void => {
            this.server.listen(0, '127.0.0.1', resolve);
        });
        const address: AddressInfo = this.server.address() as AddressInfo;
        this.baseUrl = `http://127.0.0.1:${address.port}`;
    }

    async stop(): Promise<void> {
        if (!this.server.listening) {
            return;
        }
        this.server.closeAllConnections();
        await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
            this.server.close((error?: Error): void => {
                if (error !== undefined) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /** The next request gets this status and no body. */
    respondWithStatus(status: number): void {
        this.scriptedResponses.push({ status: status, bodyText: '' });
    }

    /** The next request gets this status and the body as JSON. */
    respondWithJson(status: number, body: unknown): void {
        this.scriptedResponses.push({ status: status, bodyText: JSON.stringify(body) });
    }

    private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
            chunks.push(chunk);
        }
        const bodyText: string = Buffer.concat(chunks).toString('utf-8');
        let method: string;
        if (request.method !== undefined) {
            method = request.method;
        } else {
            method = '';
        }
        let path: string;
        if (request.url !== undefined) {
            path = request.url;
        } else {
            path = '';
        }
        this.requests.push({ method: method, path: path, body: parseJsonOrKeepText(bodyText) });

        const scripted: StandInResponse | undefined = this.scriptedResponses.shift();
        if (scripted === undefined) {
            response.writeHead(500);
            response.end('StandInPlatformServer: no response scripted for this request');
            return;
        }
        if (scripted.bodyText === '') {
            response.writeHead(scripted.status);
            response.end();
        } else {
            response.writeHead(scripted.status, { 'content-type': 'application/json' });
            response.end(scripted.bodyText);
        }
    }
}

function parseJsonOrKeepText(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
