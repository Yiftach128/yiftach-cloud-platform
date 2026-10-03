import { TextDecoder } from 'node:util';

/**
 * Reads a newline-delimited JSON body (one JSON document per line) to its end,
 * handing each parsed line to `onValue` as soon as it is complete.
 *
 * Network chunks ignore line boundaries — a chunk may end in the middle of a
 * line, or in the middle of a multi-byte character — so the unfinished tail is
 * carried over to the next chunk, and decoding is streamed for the same reason.
 * A line that is not valid JSON throws the `SyntaxError` of `JSON.parse`.
 */
export async function readNdjsonStream(
    body: ReadableStream<Uint8Array>,
    onValue: (value: unknown) => void,
): Promise<void> {
    const decoder: TextDecoder = new TextDecoder('utf-8');
    let pending: string = '';

    for await (const chunk of body) {
        pending = pending + decoder.decode(chunk, { stream: true });

        let newlineIndex: number = pending.indexOf('\n');
        while (newlineIndex !== -1) {
            const line: string = pending.substring(0, newlineIndex);
            pending = pending.substring(newlineIndex + 1);
            parseLine(line, onValue);
            newlineIndex = pending.indexOf('\n');
        }
    }

    // A body that does not end with a newline leaves its last line here.
    pending = pending + decoder.decode();
    parseLine(pending, onValue);
}

function parseLine(line: string, onValue: (value: unknown) => void): void {
    const text: string = line.trim();
    if (text === '') {
        return;
    }
    onValue(JSON.parse(text));
}
