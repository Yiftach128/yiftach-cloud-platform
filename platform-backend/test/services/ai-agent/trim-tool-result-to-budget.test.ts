/**
 * Cutting an oversized tool result to its budget: the start and the end are
 * kept around a mark that says how much went. A pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { trimToolResultToBudget } from '../../../src/services/ai-agent/trim-tool-result-to-budget.ts';

test('a result within the budget is returned unchanged, the budget itself included', () => {
    assert.equal(trimToolResultToBudget('short', 10), 'short');
    assert.equal(trimToolResultToBudget('exactly ten', 11), 'exactly ten');
});

test('an oversized result keeps its first 40% and last 60% of the budget around a mark naming the cut', () => {
    const text: string = '0123456789'.repeat(10);

    const trimmed: string = trimToolResultToBudget(text, 20);

    assert.equal(trimmed, '01234567\n... [80 characters cut here to fit the context window] ...\n890123456789');
});
