import type { ServerSentEvent } from './interfaces.ts';

/**
 * Reads a Server-Sent Events body to its end, handing each event to `onEvent`
 * as soon as its closing blank line arrives. This is what `EventSource` does
 * for a GET; a POST response has to be read by hand.
 *
 * Network chunks ignore event boundaries — a chunk may end in the middle of a
 * line, or in the middle of a multi-byte character — so the unfinished tail is
 * carried over to the next chunk, and decoding is streamed for the same reason
 * (the platform backend's `read-ndjson-stream.ts` does the same for Ollama).
 * Read with a reader rather than `for await`, which not every browser supports
 * on a ReadableStream. Rejects with whatever the body rejects with — an
 * `AbortError` when the request's signal aborts.
 */
export async function readServerSentEventsStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: ServerSentEvent) => void,
): Promise<void> {
    const reader: ReadableStreamDefaultReader<Uint8Array> = body.getReader();
    const decoder: TextDecoder = new TextDecoder('utf-8');
    let pending: string = '';
    let eventName: string = '';
    let dataLines: string[] = [];

    function handleLine(line: string): void {
        // A blank line closes the event; one without data is dropped, as the SSE rules say.
        if (line === '') {
            if (dataLines.length > 0) {
                let name: string = 'message';
                if (eventName !== '') {
                    name = eventName;
                }
                onEvent({ event: name, data: dataLines.join('\n') });
            }
            eventName = '';
            dataLines = [];
            return;
        }
        // A line starting with a colon is a comment (servers use them as keep-alives).
        if (line.startsWith(':')) {
            return;
        }

        let field: string = line;
        let value: string = '';
        const colonIndex: number = line.indexOf(':');
        if (colonIndex !== -1) {
            field = line.substring(0, colonIndex);
            value = line.substring(colonIndex + 1);
            if (value.startsWith(' ')) {
                value = value.substring(1);
            }
        }

        if (field === 'event') {
            eventName = value;
        } else if (field === 'data') {
            dataLines.push(value);
        }
    }

    while (true) {
        const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
        if (result.done) {
            break;
        }
        pending = pending + decoder.decode(result.value, { stream: true });

        let newlineIndex: number = pending.indexOf('\n');
        while (newlineIndex !== -1) {
            let line: string = pending.substring(0, newlineIndex);
            pending = pending.substring(newlineIndex + 1);
            if (line.endsWith('\r')) {
                line = line.substring(0, line.length - 1);
            }
            handleLine(line);
            newlineIndex = pending.indexOf('\n');
        }
    }
    // An event still open when the body ends was cut off mid-way and is dropped, as the SSE rules say.
}
