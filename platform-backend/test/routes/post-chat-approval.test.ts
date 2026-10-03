/**
 * POST /chat/approvals: the person's answer to the call a reply is waiting
 * on, taken with 204 and reported back on the reply's own stream; refused
 * with 409 when no call waits. Over HTTP in-process, with the assistant built
 * as `server.ts` builds it over a fake model and fake tools
 * (`ChatRoutesWithFakes`).
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import type { ServerSentEvent } from '../server-sent-events/interfaces.ts';
import { ServerSentEventReader } from '../server-sent-events/server-sent-event-reader.ts';
import { ChatRoutesWithFakes, questionBody } from './chat-routes-with-fakes.ts';

test('the answer to a waiting call is taken with 204 and shows on the stream as the approval, then the result', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);
    chat.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    chat.llm.queueTextReply('Deleted x.');
    const reply: Response = await chat.postChat(questionBody('delete x'));
    const events: ServerSentEventReader = new ServerSentEventReader(reply);
    const untilAsked: ServerSentEvent[] = await events.readUntil('tool_call');

    const answer: Response = await chat.answerApproval(1, 'approved');
    const afterAnswer: ServerSentEvent[] = await events.readToEnd();

    assert.deepEqual(untilAsked, [{
        event: 'tool_call',
        data: { type: 'tool_call', callId: 1, name: 'delete_thing', arguments: { id: 'x' }, needsApproval: true, destructive: true },
    }]);
    assert.equal(answer.status, 204);
    assert.deepEqual(afterAnswer.map((event: ServerSentEvent) => event.data), [
        { type: 'tool_approval', callId: 1, name: 'delete_thing', decision: 'approved' },
        { type: 'tool_result', callId: 1, name: 'delete_thing', isError: false, text: 'deleted' },
        { type: 'delta', text: 'Deleted x.' },
        { type: 'done', stopReason: 'answered', modelCalls: 2, peakPromptTokens: 0 },
    ]);
});

test('an answer when no call waits is refused with 409', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);

    const answer: Response = await chat.answerApproval(1, 'approved');

    assert.equal(answer.status, 409);
    assert.deepEqual(await answer.json(), { message: 'No tool call #1 is waiting for approval' });
});
