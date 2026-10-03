/**
 * The character budget tool results share: one turn gets at most half the
 * run's budget, split across its calls, and what a turn spent is gone for the
 * next, down to a floor per result that keeps an error readable. The model,
 * the tools and the approver are fakes.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrchestratorWithFakes } from './orchestrator-with-fakes.ts';

/** `length` characters of digits, so a cut is easy to see. */
function digits(length: number): string {
    let text: string = '';
    while (text.length < length) {
        text = text + '0123456789';
    }
    return text.substring(0, length);
}

/** True when `resultText` is `original` cut to `budget`: its first 40% and last 60% around the cut mark. */
function isCutTo(resultText: string | undefined, original: string, budget: number): boolean {
    if (resultText === undefined) {
        return false;
    }
    const headChars: number = Math.floor(budget * 0.4);
    const tailChars: number = budget - headChars;
    return resultText.startsWith(original.substring(0, headChars))
        && resultText.endsWith(original.substring(original.length - tailChars))
        && resultText.includes('characters cut here');
}

test('one turn may spend at most half the run\'s budget, split evenly across its calls', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ toolResultBudgetChars: 2000 });
    const longList: string = digits(2000);
    const longCount: string = digits(2000);
    harness.tools.answerWith('list_things', { text: longList, isError: false });
    harness.tools.answerWith('count_things', { text: longCount, isError: false });
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }, { name: 'count_things', arguments: {} }]);
    harness.llm.queueTextReply('Long.');

    const result = await harness.ask('list and count');

    const resultTexts: string[] = result.toolCalls.map((call) => call.resultText);
    assert.equal(resultTexts.length, 2);
    assert.ok(isCutTo(resultTexts[0], longList, 500), 'the first result is cut to 500 characters');
    assert.ok(isCutTo(resultTexts[1], longCount, 500), 'the second result is cut to 500 characters');
});

test('what a turn spent is gone for the next turns, down to the floor of 300 characters per result', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ toolResultBudgetChars: 1000 });
    const firstResult: string = digits(500);
    const laterResult: string = digits(600);
    harness.tools.answerWith('list_things', { text: firstResult, isError: false });
    harness.tools.answerWith('count_things', { text: laterResult, isError: false });
    harness.tools.answerWith('add_thing', { text: laterResult, isError: false });
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }]);
    harness.llm.queueToolCallReply([{ name: 'count_things', arguments: {} }]);
    harness.llm.queueToolCallReply([{ name: 'add_thing', arguments: {} }]);
    harness.llm.queueTextReply('Done.');

    const result = await harness.ask('list, count, add');

    const resultTexts: string[] = result.toolCalls.map((call) => call.resultText);
    assert.equal(resultTexts[0], firstResult, 'the first turn\'s 500 characters fit its half of the budget');
    assert.ok(isCutTo(resultTexts[1], laterResult, 500), 'the second turn gets the 500 that are left');
    assert.ok(isCutTo(resultTexts[2], laterResult, 300), 'the third turn gets the floor');
});

test('a result within its share goes to the model whole', async () => {
    const harness: OrchestratorWithFakes = new OrchestratorWithFakes({ toolResultBudgetChars: 1000 });
    const shortResult: string = digits(400);
    harness.tools.answerWith('list_things', { text: shortResult, isError: false });
    harness.llm.queueToolCallReply([{ name: 'list_things', arguments: {} }]);
    harness.llm.queueTextReply('Done.');

    const result = await harness.ask('list');

    assert.deepEqual(result.toolCalls.map((call) => call.resultText), [shortResult]);
});
