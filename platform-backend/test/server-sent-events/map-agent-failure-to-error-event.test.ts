/**
 * The third error mapper: a run that failed after the stream opened ends it
 * with an `error` event, worded for the person chatting. Pure; nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapAgentFailureToErrorEvent } from '../../src/server-sent-events/map-agent-failure-to-error-event.ts';
import { LlmRequestError } from '../../src/services/llm/llm-request-error.ts';
import { LlmUnavailableError } from '../../src/services/llm/llm-unavailable-error.ts';

test('the two model-server failures keep their own message under their own code, since the client already says what to check', () => {
    const unavailable: LlmUnavailableError = new LlmUnavailableError('http://127.0.0.1:11434', 'connection refused', undefined);
    const refused: LlmRequestError = new LlmRequestError(404, 'model "qwen3:nope" not found');

    assert.deepEqual(mapAgentFailureToErrorEvent(unavailable), { type: 'error', code: 'llm_unavailable', message: unavailable.message });
    assert.deepEqual(mapAgentFailureToErrorEvent(refused), { type: 'error', code: 'llm_request_failed', message: refused.message });
});

test('anything else is "internal" with its message behind a plain prefix; a thrown non-Error is rendered as text', () => {
    assert.deepEqual(
        mapAgentFailureToErrorEvent(new TypeError('x is not a function')),
        { type: 'error', code: 'internal', message: 'The assistant failed unexpectedly: x is not a function' },
    );
    assert.deepEqual(
        mapAgentFailureToErrorEvent('just a string'),
        { type: 'error', code: 'internal', message: 'The assistant failed unexpectedly: just a string' },
    );
});
