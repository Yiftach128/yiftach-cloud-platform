/**
 * The raw logs payload becoming lines: Docker's multiplexed frames for a
 * non-TTY container, the plain byte stream of a TTY one, and the timestamp
 * prefix every line carries. Pure; nothing faked. Frames are built by hand
 * here, as the daemon writes them: an 8-byte header (stream type, three zero
 * bytes, big-endian payload length) and the payload.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ContainerLogLine } from '../../../src/services/docker/interfaces.ts';
import { parseContainerLogs } from '../../../src/services/docker/parse-container-logs.ts';

const STDOUT = 1;
const STDERR = 2;
const STAMP_1 = '2026-09-30T08:00:00.000000000Z';
const STAMP_2 = '2026-09-30T08:00:01.000000000Z';
const STAMP_3 = '2026-09-30T08:00:02.000000000Z';

test('a non-TTY payload is read frame by frame, each line tagged by its stream', () => {
    const payload: Buffer = Buffer.concat([
        frame(STDOUT, `${STAMP_1} started\n`),
        frame(STDERR, `${STAMP_2} oops\n`),
    ]);

    const lines: ContainerLogLine[] = parseContainerLogs(payload, false);

    assert.deepEqual(lines, [
        { stream: 'stdout', timestamp: STAMP_1, text: 'started' },
        { stream: 'stderr', timestamp: STAMP_2, text: 'oops' },
    ]);
});

test('a frame that stops mid-line is joined to the next frame of the same stream; a truncated last frame keeps what is there', () => {
    const payload: Buffer = Buffer.concat([
        frame(STDOUT, `${STAMP_1} hel`),
        frame(STDERR, `${STAMP_2} err\n`),
        frame(STDOUT, 'lo\n'),
        frame(STDOUT, `${STAMP_3} cut off`, 100),
    ]);

    const lines: ContainerLogLine[] = parseContainerLogs(payload, false);

    assert.deepEqual(lines, [
        { stream: 'stderr', timestamp: STAMP_2, text: 'err' },
        { stream: 'stdout', timestamp: STAMP_1, text: 'hello' },
        { stream: 'stdout', timestamp: STAMP_3, text: 'cut off' },
    ]);
});

test('TTY output has no framing: every line is stdout, a trailing newline is not a line, a carriage return is stripped', () => {
    const payload: Buffer = Buffer.from(`${STAMP_1} one\r\n${STAMP_2} two\n`, 'utf8');

    const lines: ContainerLogLine[] = parseContainerLogs(payload, true);

    assert.deepEqual(lines, [
        { stream: 'stdout', timestamp: STAMP_1, text: 'one' },
        { stream: 'stdout', timestamp: STAMP_2, text: 'two' },
    ]);
});

test('a line without a parseable timestamp prefix is all text; a payload docker-modem already parsed as JSON is read back as its text', () => {
    const unstamped: ContainerLogLine[] = parseContainerLogs(Buffer.from('no stamp here\n', 'utf8'), true);
    const parsedByModem: ContainerLogLine[] = parseContainerLogs({ level: 'info' }, true);

    assert.deepEqual(unstamped, [{ stream: 'stdout', timestamp: '', text: 'no stamp here' }]);
    assert.deepEqual(parsedByModem, [{ stream: 'stdout', timestamp: '', text: '{"level":"info"}' }]);
});

/** One multiplexed frame; `declaredLength` overstates the payload to make a truncated frame. */
function frame(streamType: number, text: string, declaredLength?: number): Buffer {
    const payload: Buffer = Buffer.from(text, 'utf8');
    let length: number;
    if (declaredLength === undefined) {
        length = payload.length;
    } else {
        length = declaredLength;
    }
    const header: Buffer = Buffer.alloc(8);
    header.writeUInt8(streamType, 0);
    header.writeUInt32BE(length, 4);
    return Buffer.concat([header, payload]);
}
