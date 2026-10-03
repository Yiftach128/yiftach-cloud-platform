/**
 * The newline-delimited JSON reader behind the Ollama stream: lines and
 * multi-byte characters survive being split across network chunks, the last
 * line needs no newline, blank lines are skipped, and a line that is not JSON
 * stops the read. Fed a `ReadableStream` built from byte chunks; nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readNdjsonStream } from '../../../../src/services/llm/ollama/read-ndjson-stream.ts';

test('a line split across two chunks is delivered once, complete', async () => {
    const values: unknown[] = await readAll([
        '{"a":1}\n{"b"',
        ':2}\n',
    ].map(toBytes));

    assert.deepEqual(values, [{ a: 1 }, { b: 2 }]);
});

test('a multi-byte character split across two chunks survives', async () => {
    const bytes: Uint8Array = toBytes('{"text":"héllo"}\n');
    const cutInsideTheAccent: number = bytes.indexOf(0xc3) + 1;

    const values: unknown[] = await readAll([bytes.slice(0, cutInsideTheAccent), bytes.slice(cutInsideTheAccent)]);

    assert.deepEqual(values, [{ text: 'héllo' }]);
});

test('a body that does not end in a newline still delivers its last line; blank lines are skipped', async () => {
    const values: unknown[] = await readAll([toBytes('{"a":1}\n\n   \n{"b":2}')]);

    assert.deepEqual(values, [{ a: 1 }, { b: 2 }]);
});

test('a line that is not JSON throws, and nothing after it is delivered', async () => {
    const delivered: unknown[] = [];
    const read: Promise<void> = readNdjsonStream(streamOf([toBytes('{"a":1}\nnot json\n{"b":2}\n')]), (value: unknown): void => {
        delivered.push(value);
    });

    await assert.rejects(read, SyntaxError);
    assert.deepEqual(delivered, [{ a: 1 }]);
});

function toBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller: ReadableStreamDefaultController<Uint8Array>): void {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }
            controller.close();
        },
    });
}

async function readAll(chunks: Uint8Array[]): Promise<unknown[]> {
    const values: unknown[] = [];
    await readNdjsonStream(streamOf(chunks), (value: unknown): void => {
        values.push(value);
    });
    return values;
}
