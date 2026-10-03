import type { ReadableStreamDefaultReader, ReadableStreamReadResult } from 'node:stream/web';
import { TextDecoder } from 'node:util';

import type { ServerSentEvent } from './interfaces.ts';

/**
 * Reads a `fetch` response body as Server-Sent Events while the stream is
 * still open — a chat test reads the `tool_call` event and answers the
 * approval before the stream can end. One `{event, data}` per blank-line
 * separated block, the data JSON-parsed. Deliberately simpler than the
 * frontend's reader: the backend writes one `event:` and one `data:` line per
 * event, and that is all this reads.
 */
export class ServerSentEventReader {
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
    private readonly decoder: TextDecoder = new TextDecoder();
    private readonly pending: ServerSentEvent[] = [];
    private buffered: string = '';
    private ended: boolean = false;

    constructor(response: Response) {
        if (response.body === null) {
            throw new Error('ServerSentEventReader: the response has no body');
        }
        this.reader = response.body.getReader();
    }

    /** The next event; fails when the stream ends first. */
    async nextEvent(): Promise<ServerSentEvent> {
        while (this.pending.length === 0) {
            if (this.ended) {
                throw new Error('ServerSentEventReader: the stream ended before the next event');
            }
            await this.readChunk();
        }
        const event: ServerSentEvent | undefined = this.pending.shift();
        if (event === undefined) {
            throw new Error('ServerSentEventReader: no event pending');
        }
        return event;
    }

    /** Reads until the next event of that name, returning every event read on the way, that one last. */
    async readUntil(eventName: string): Promise<ServerSentEvent[]> {
        const events: ServerSentEvent[] = [];
        let event: ServerSentEvent = await this.nextEvent();
        events.push(event);
        while (event.event !== eventName) {
            event = await this.nextEvent();
            events.push(event);
        }
        return events;
    }

    /** Every remaining event up to the end of the stream. */
    async readToEnd(): Promise<ServerSentEvent[]> {
        while (!this.ended) {
            await this.readChunk();
        }
        return this.pending.splice(0);
    }

    private async readChunk(): Promise<void> {
        const result: ReadableStreamReadResult<Uint8Array> = await this.reader.read();
        if (result.done) {
            this.ended = true;
            return;
        }
        this.buffered = this.buffered + this.decoder.decode(result.value, { stream: true });
        let separator: number = this.buffered.indexOf('\n\n');
        while (separator !== -1) {
            const block: string = this.buffered.slice(0, separator);
            this.buffered = this.buffered.slice(separator + 2);
            this.pending.push(parseEventBlock(block));
            separator = this.buffered.indexOf('\n\n');
        }
    }
}

function parseEventBlock(block: string): ServerSentEvent {
    let eventName: string = '';
    let data: string = '';
    for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
            eventName = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
            data = line.slice('data: '.length);
        }
    }
    return { event: eventName, data: JSON.parse(data) };
}
