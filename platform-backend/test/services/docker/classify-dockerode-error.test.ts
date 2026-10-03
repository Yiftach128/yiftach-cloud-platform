/**
 * The question the request runner asks of a dockerode failure: did the daemon
 * answer and refuse (an engine error, mapped), or was it never reached (a
 * connection error, worth a boot and a retry)? Pure; the errors are built by
 * hand with the fields docker-modem and Node's sockets attach.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isConnectionError, isEngineError } from '../../../src/services/docker/classify-dockerode-error.ts';

test('an error the daemon answered carries a numeric statusCode; one it never saw does not', () => {
    assert.equal(isEngineError(errorWith({ statusCode: 404 })), true);
    assert.equal(isEngineError(errorWith({ statusCode: '404' })), false);
    assert.equal(isEngineError(new Error('request failed')), false);
    assert.equal(isEngineError('not even an error'), false);
});

test('a connection error is told by a Node system code on the error or on its cause, or by http\'s "socket hang up"', () => {
    assert.equal(isConnectionError(errorWith({ code: 'ECONNREFUSED' })), true);
    assert.equal(isConnectionError(errorWith({ code: 'ENOENT' })), true);
    assert.equal(isConnectionError(new Error('request failed', { cause: errorWith({ code: 'ECONNRESET' }) })), true);
    assert.equal(isConnectionError(new Error('socket hang up')), true);
});

test('a failure with neither is not a connection error, so it is never retried', () => {
    assert.equal(isConnectionError(new Error('Unexpected end of JSON input')), false);
    assert.equal(isConnectionError(errorWith({ code: 'EINVAL' })), false);
    assert.equal(isConnectionError('ECONNREFUSED'), false);
});

/** An error with the extra fields a library attaches, as docker-modem and the socket layer do. */
function errorWith(fields: Record<string, unknown>): Error {
    return Object.assign(new Error('request failed'), fields);
}
