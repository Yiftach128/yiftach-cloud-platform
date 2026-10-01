/**
 * The value formatting every tool result shares, chosen for a model's
 * reading: ids cut to Docker's short form, bytes pre-divided into MiB, and
 * port bindings as the `docker ps` strings a reader knows. Pure functions,
 * nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    roundToTwoDecimals,
    toMebibytes,
    toPortSummaries,
    toShortContainerId,
    toShortImageId,
} from '../../../../src/mcp/server/tool-results-utils/tool-result-value-formatters.ts';

const MEBIBYTE: number = 1024 * 1024;

test('a container id is cut to its 12-character short form', () => {
    assert.equal(toShortContainerId('0123456789abcdef'.repeat(4)), '0123456789ab');
});

test('an image id loses its "sha256:" prefix and is cut to 12 characters; one without the prefix is only cut', () => {
    assert.equal(toShortImageId(`sha256:${'fedcba9876543210'.repeat(4)}`), 'fedcba987654');
    assert.equal(toShortImageId('fedcba9876543210fedcba9876543210'), 'fedcba987654');
});

test('bytes become MiB to one decimal; percentages are rounded to two', () => {
    assert.equal(toMebibytes(50 * MEBIBYTE + 60_000), 50.1);
    assert.equal(toMebibytes(0), 0);
    assert.equal(roundToTwoDecimals(12.345), 12.35);
});

test('ports read as docker ps strings: a wildcard host is omitted, a specific host kept, an unpublished port said so, and the IPv4/IPv6 twin collapses into one', () => {
    const summaries: string[] = toPortSummaries([
        { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' },
        { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '::' },
        { privatePort: 3000, publicPort: 3080, type: 'tcp', ip: '127.0.0.1' },
        { privatePort: 11434, type: 'tcp' },
    ]);

    assert.deepEqual(summaries, ['8080->80/tcp', '127.0.0.1:3080->3000/tcp', '11434/tcp (not published)']);
});
