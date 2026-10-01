import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { StandInRequest, StandInResponse } from './interfaces.ts';

/**
 * Stands in for Ollama on `127.0.0.1`, a free port: answers each request with
 * the response the test scripted next (FIFO) and keeps every request it got.
 * It knows nothing of Ollama's routes or shapes; a test scripts the exact
 * bytes. A response can be held open after its body, for a stream that never
 * ends; `stop` tears those down.
 */
export class StandInOllamaServer {
    /** Every request received, in order, with its parsed JSON body. */
    readonly requests: StandInRequest[] = [];
    baseUrl: string = '';
    private readonly server: Server;
    private readonly scriptedResponses: StandInResponse[] = [];
    private readonly heldResponses: ServerResponse[] = [];

    constructor() {
        this.server = createServer((request: IncomingMessage, response: ServerResponse): void => {
            void this.answer(request, response);
        });
    }

    async start(): Promise<void> {
        await new Promise<void>((resolve: () => void): void => {
            this.server.listen(0, '127.0.0.1', resolve);
        });
        const address: AddressInfo = this.server.address() as AddressInfo;
        this.baseUrl = `http://127.0.0.1:${address.port}`;
    }

    async stop(): Promise<void> {
        for (const response of this.heldResponses) {
            response.destroy();
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

    /** The next request gets this status and body as they are. */
    respondWith(status: number, bodyText: string): void {
        this.scriptedResponses.push({ status: status, bodyText: bodyText, holdOpen: false });
    }

    /** The next request gets a 200 with one JSON document per line, then the end of the body. */
    respondWithJsonLines(lines: unknown[]): void {
        this.scriptedResponses.push({ status: 200, bodyText: toJsonLines(lines), holdOpen: false });
    }

    /** The next request gets a 200 with these lines, and the response then stays open until `stop`. */
    respondWithJsonLinesAndHoldOpen(lines: unknown[]): void {
        this.scriptedResponses.push({ status: 200, bodyText: toJsonLines(lines), holdOpen: true });
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
            response.end('StandInOllamaServer: no response scripted for this request');
            return;
        }
        response.writeHead(scripted.status);
        if (scripted.holdOpen) {
            response.write(scripted.bodyText);
            this.heldResponses.push(response);
        } else {
            response.end(scripted.bodyText);
        }
    }
}

function toJsonLines(lines: unknown[]): string {
    return lines.map((line: unknown): string => JSON.stringify(line) + '\n').join('');
}

function parseJsonOrKeepText(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
