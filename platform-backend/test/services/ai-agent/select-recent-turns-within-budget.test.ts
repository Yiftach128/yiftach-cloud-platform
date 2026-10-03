/**
 * The history window: which turns of a conversation the model gets to read.
 * A pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChatTurn } from '../../../src/services/ai-agent/interfaces.ts';
import { selectRecentTurnsWithinBudget } from '../../../src/services/ai-agent/select-recent-turns-within-budget.ts';

function user(text: string): ChatTurn {
    return { role: 'user', text: text };
}

function assistant(text: string): ChatTurn {
    return { role: 'assistant', text: text };
}

test('the newest turn is always kept, whatever its size', () => {
    const turns: ChatTurn[] = [user('a question far longer than the budget')];

    assert.deepEqual(selectRecentTurnsWithinBudget(turns, 5), turns);
});

test('older turns are kept, newest first, while they fit the budget together', () => {
    const turns: ChatTurn[] = [user('aaaa'), assistant('bbbb'), user('cc')];

    assert.deepEqual(selectRecentTurnsWithinBudget(turns, 10), turns);
    assert.deepEqual(selectRecentTurnsWithinBudget(turns, 4), [user('cc')]);
});

test('the walk stops at the first turn that does not fit, so the kept part has no gap', () => {
    const turns: ChatTurn[] = [user('aaaa'), assistant('bbbbbb'), user('c'), assistant('d'), user('e')];

    // 'aaaa' would fit the 4 characters left, but 'bbbbbb' between did not.
    assert.deepEqual(selectRecentTurnsWithinBudget(turns, 7), [user('c'), assistant('d'), user('e')]);
});

test('a kept part never opens on an assistant turn: an answer without its question is dropped', () => {
    const turns: ChatTurn[] = [user('aaaa'), assistant('bbbb'), user('cc')];

    assert.deepEqual(selectRecentTurnsWithinBudget(turns, 9), [user('cc')]);
});
