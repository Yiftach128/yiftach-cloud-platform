import type { Response } from 'express';

/**
 * One HTTP response used as a Server-Sent Events stream: `open()` sends the
 * headers, every `send()` writes one event (`event: <name>` plus the data as
 * one line of JSON), `close()` ends the response.
 *
 * The reader may leave at any moment — for the chat that is the Stop button.
 * Writing to a response that has ended makes Node emit an `error` event nobody
 * listens for, so `send()` and `close()` quietly do nothing once the response
 * is over.
 */
export class ServerSentEventStream {
    private readonly response: Response;

    constructor(response: Response) {
        this.response = response;
    }

    /** From here on the status is 200 for good: a later failure has to travel as an event. */
    open(): void {
        this.response.status(200);
        this.response.setHeader('Content-Type', 'text/event-stream');
        this.response.setHeader('Cache-Control', 'no-cache');
        // Sent now rather than with the first event, which may be seconds away.
        this.response.flushHeaders();
    }

    send(eventName: string, data: unknown): void {
        if (this.isOver()) {
            return;
        }
        // JSON.stringify never emits a raw newline, so the data always fits the one `data:` line.
        this.response.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    close(): void {
        if (this.isOver()) {
            return;
        }
        this.response.end();
    }

    private isOver(): boolean {
        return this.response.writableEnded || this.response.destroyed;
    }
}
