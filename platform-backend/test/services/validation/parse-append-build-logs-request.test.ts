/**
 * The POST /builds-queue/:id/logs body: an array of strings, capped per
 * request. Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAppendBuildLogsRequest } from '../../../src/services/validation/parse-append-build-logs-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('the lines are taken as given, ANSI escapes included', () => {
    assert.deepEqual(
        parseAppendBuildLogsRequest({ lines: ['Step 1/3', '\u001b[32mdone\u001b[0m', ''] }),
        ['Step 1/3', '\u001b[32mdone\u001b[0m', ''],
    );
});

test('a body without a "lines" array is refused', () => {
    assertRefused([], 'Request body must be a JSON object');
    assertRefused({ lines: 'Step 1/3' }, '"lines" must be an array of strings');
});

test('a request holds at most 1000 lines', () => {
    assert.equal(parseAppendBuildLogsRequest({ lines: new Array(1000).fill('x') }).length, 1000);

    assertRefused({ lines: new Array(1001).fill('x') }, '"lines" must have at most 1000 entries');
});

test('a line that is not a string is refused', () => {
    assertRefused({ lines: ['Step 1/3', 2] }, '"lines" must contain only strings');
});

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseAppendBuildLogsRequest(body), new ValidationError(message));
}
