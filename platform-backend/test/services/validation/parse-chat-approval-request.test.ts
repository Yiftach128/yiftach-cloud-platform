/**
 * The POST /chat/approvals body: a positive integer call id and a decision of
 * "approved" or "denied". Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseChatApprovalRequest } from '../../../src/services/validation/parse-chat-approval-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('a call id and a decision are taken as the answer', () => {
    assert.deepEqual(parseChatApprovalRequest({ callId: 3, decision: 'denied' }), { callId: 3, decision: 'denied' });
});

test('a call id that is not a positive integer is refused', () => {
    assertRefused({ callId: 0, decision: 'approved' }, '"callId" must be a positive integer');
    assertRefused({ callId: 1.5, decision: 'approved' }, '"callId" must be a positive integer');
    assertRefused({ callId: '1', decision: 'approved' }, '"callId" must be a positive integer');
});

test('a decision other than "approved" or "denied" is refused', () => {
    assertRefused({ callId: 1, decision: 'maybe' }, '"decision" must be "approved" or "denied"');
    assertRefused({ callId: 1 }, '"decision" must be "approved" or "denied"');
});

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseChatApprovalRequest(body), new ValidationError(message));
}
