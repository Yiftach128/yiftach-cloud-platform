/**
 * The POST /builds-queue/:id/result body: a terminal status and an optional
 * error message, cut to a sane length. Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBuildResultRequest } from '../../../src/services/validation/parse-build-result-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('a success carries the status alone; a failure carries its message', () => {
    assert.deepEqual(parseBuildResultRequest({ status: 'succeeded' }), { status: 'succeeded' });
    assert.deepEqual(
        parseBuildResultRequest({ status: 'failed', errorMessage: 'Dockerfile not found' }),
        { status: 'failed', errorMessage: 'Dockerfile not found' },
    );
});

test('a status other than "succeeded" or "failed" is refused', () => {
    assertRefused({ status: 'done' }, '"status" must be "succeeded" or "failed"');
    assertRefused({}, '"status" must be "succeeded" or "failed"');
});

test('an error message that is not a string is refused', () => {
    assertRefused({ status: 'failed', errorMessage: { code: 1 } }, '"errorMessage" must be a string when present');
});

test('an error message is cut to 10000 characters', () => {
    const report = parseBuildResultRequest({ status: 'failed', errorMessage: 'e'.repeat(10_001) });

    assert.equal(report.errorMessage, 'e'.repeat(10_000));
});

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseBuildResultRequest(body), new ValidationError(message));
}
