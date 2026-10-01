/**
 * The RFC3339 timestamp of a log line going back to the daemon as the
 * "seconds[.fraction]" its `since` parameter takes. Pure; nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toDaemonTimestamp } from '../../../src/services/docker/to-daemon-timestamp.ts';

test('the fraction digits are carried over as text, so the nanoseconds a Date would truncate survive the round trip', () => {
    assert.equal(toDaemonTimestamp('2026-08-02T22:21:27.122576307Z'), '1785709287.122576307');
});

test('without a fraction the whole seconds are sent; a zone offset is honoured', () => {
    assert.equal(toDaemonTimestamp('2026-08-02T22:21:27Z'), '1785709287');
    assert.equal(toDaemonTimestamp('2026-08-03T00:21:27.5+02:00'), '1785709287.5');
});
