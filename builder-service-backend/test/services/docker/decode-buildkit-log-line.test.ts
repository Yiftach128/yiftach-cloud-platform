/**
 * The repair of BuildKit step output, which reaches the builder still
 * base64-encoded: a line is decoded only when it is unmistakably encoded
 * readable text, and everything else passes through as it came. A pure
 * function; nothing is faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeBuildKitLogLine } from '../../../src/services/docker/decode-buildkit-log-line.ts';

test('base64 of readable text is decoded', () => {
    const encoded: string = toBase64('added 57 packages in 3s');

    assert.deepEqual(decodeBuildKitLogLine(encoded), ['added 57 packages in 3s']);
});

test('a decoded chunk holding several lines is split, without trailing whitespace or blank lines', () => {
    const encoded: string = toBase64('Step one  \n\nStep two\r\n\u001b[32mdone\u001b[0m\n');

    assert.deepEqual(decodeBuildKitLogLine(encoded), ['Step one', 'Step two', '\u001b[32mdone\u001b[0m']);
});

test('a plain-text line passes unchanged', () => {
    assert.deepEqual(decodeBuildKitLogLine('#5 [2/3] RUN npm ci'), ['#5 [2/3] RUN npm ci']);
});

test('a word that only looks like base64 passes unchanged: too short, or decoding to no readable text', () => {
    assert.deepEqual(decodeBuildKitLogLine('DONE'), ['DONE']);
    assert.deepEqual(decodeBuildKitLogLine('building'), ['building']);
});

test('base64 of binary data passes unchanged', () => {
    const encoded: string = Buffer.from([0, 1, 2, 255, 254, 16]).toString('base64');

    assert.deepEqual(decodeBuildKitLogLine(encoded), [encoded]);
});

function toBase64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}
