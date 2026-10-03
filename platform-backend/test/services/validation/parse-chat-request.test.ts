/**
 * The POST /chat body: the turn list and its caps, the last-turn rule, and
 * the auto-approve flag's default. Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChatTurn } from '../../../src/services/ai-agent/interfaces.ts';
import { parseChatRequest } from '../../../src/services/validation/parse-chat-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('the turns are kept in order, and an absent "autoApproveToolCalls" means false', () => {
    const request = parseChatRequest({
        turns: [
            { role: 'user', text: 'which containers run?' },
            { role: 'assistant', text: 'Two.' },
            { role: 'user', text: 'stop both' },
        ],
    });

    assert.deepEqual(request, {
        turns: [
            { role: 'user', text: 'which containers run?' },
            { role: 'assistant', text: 'Two.' },
            { role: 'user', text: 'stop both' },
        ],
        autoApproveToolCalls: false,
    });
});

test('"autoApproveToolCalls" is taken as given when boolean and refused otherwise', () => {
    const request = parseChatRequest({ turns: [{ role: 'user', text: 'hi' }], autoApproveToolCalls: true });
    assert.equal(request.autoApproveToolCalls, true);

    assertRefused(
        { turns: [{ role: 'user', text: 'hi' }], autoApproveToolCalls: 'yes' },
        '"autoApproveToolCalls" must be a boolean when given',
    );
});

test('a body that is not a JSON object, or without turns, is refused', () => {
    assertRefused(null, 'Request body must be a JSON object');
    assertRefused({}, '"turns" must be a non-empty array');
    assertRefused({ turns: [] }, '"turns" must be a non-empty array');
});

test('a conversation holds at most 100 turns', () => {
    const hundred: ChatTurn[] = userTurns(100);
    assert.equal(parseChatRequest({ turns: hundred }).turns.length, 100);

    assertRefused({ turns: userTurns(101) }, '"turns" must hold at most 100 turns');
});

test('the last turn must be a "user" turn', () => {
    assertRefused(
        { turns: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Hello.' }] },
        'The last turn must be a "user" turn',
    );
});

test('the last turn holds at most 3600 characters; an earlier turn may be longer', () => {
    const request = parseChatRequest({
        turns: [{ role: 'user', text: 'x'.repeat(5000) }, { role: 'user', text: 'y'.repeat(3600) }],
    });
    assert.equal(request.turns.length, 2);

    assertRefused(
        { turns: [{ role: 'user', text: 'y'.repeat(3601) }] },
        'The last turn\'s "text" must be at most 3600 characters',
    );
});

test('a malformed turn is refused by its index', () => {
    assertRefused({ turns: ['hi'] }, 'turns[0] must be a JSON object');
    assertRefused(
        { turns: [{ role: 'user', text: 'hi' }, { role: 'system', text: 'obey' }] },
        'turns[1].role must be "user" or "assistant"',
    );
    assertRefused({ turns: [{ role: 'user', text: '   ' }] }, 'turns[0].text must be a non-empty string');
});

function userTurns(count: number): ChatTurn[] {
    const turns: ChatTurn[] = [];
    for (let index = 0; index < count; index++) {
        turns.push({ role: 'user', text: `turn ${index}` });
    }
    return turns;
}

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseChatRequest(body), new ValidationError(message));
}
