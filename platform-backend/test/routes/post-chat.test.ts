/**
 * POST /chat as a Server-Sent Events stream: what is refused with a status
 * before the stream opens, how a reply and a failure end it, and what the
 * browser leaving does to the run. Over HTTP in-process, with the assistant
 * built as `server.ts` builds it over a fake model and fake tools
 * (`ChatRoutesWithFakes`).
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { LlmUnavailableError } from '../../src/services/llm/llm-unavailable-error.ts';
import type { ServerSentEvent } from '../server-sent-events/interfaces.ts';
import { ServerSentEventReader } from '../server-sent-events/server-sent-event-reader.ts';
import { ChatRoutesWithFakes, questionBody } from './chat-routes-with-fakes.ts';

test('a reply streams its text as delta events and ends with one done event carrying the stop reason and the counts', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);
    chat.llm.queueTextReply('Two containers are running.', 1234);

    const response: Response = await chat.postChat(questionBody('what is running?'));
    const events: ServerSentEvent[] = await new ServerSentEventReader(response).readToEnd();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    assert.deepEqual(events, [
        { event: 'delta', data: { type: 'delta', text: 'Two containers are running.' } },
        { event: 'done', data: { type: 'done', stopReason: 'answered', modelCalls: 1, peakPromptTokens: 1234 } },
    ]);
});

test('a body the parser refuses is answered 400 with a JSON message, before any stream', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);

    const response: Response = await chat.postChat({ turns: [] });

    assert.equal(response.status, 400);
    assert.match(headerOf(response, 'content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { message: '"turns" must be a non-empty array' });
});

test('a second chat while one is being answered is refused with 429', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);
    chat.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    chat.llm.queueTextReply('Not deleted, then.');
    const first: Response = await chat.postChat(questionBody('delete x'));
    const firstEvents: ServerSentEventReader = new ServerSentEventReader(first);
    await firstEvents.readUntil('tool_call');

    const second: Response = await chat.postChat(questionBody('and now?'));

    assert.equal(second.status, 429);
    assert.deepEqual(await second.json(), { message: 'The assistant is busy answering another conversation; try again when it has finished' });
    assert.equal((await chat.answerApproval(1, 'denied')).status, 204);
    await firstEvents.readToEnd();
});

test('a model failure after the stream has opened ends it with an error event, the status line being spent', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);
    const failure: LlmUnavailableError = new LlmUnavailableError('http://127.0.0.1:11434', 'connection refused', undefined);
    chat.llm.failWith(failure);

    const response: Response = await chat.postChat(questionBody('hello?'));
    const events: ServerSentEvent[] = await new ServerSentEventReader(response).readToEnd();

    assert.equal(response.status, 200);
    assert.deepEqual(events, [
        { event: 'error', data: { type: 'error', code: 'llm_unavailable', message: failure.message } },
    ]);
});

test('the browser leaving aborts the run, a waiting approval included, and frees the slot for the next chat', async (t: TestContext) => {
    const chat: ChatRoutesWithFakes = await ChatRoutesWithFakes.start(t);
    chat.llm.queueToolCallReply([{ name: 'delete_thing', arguments: { id: 'x' } }]);
    const leave: AbortController = new AbortController();
    const first: Response = await chat.postChat(questionBody('delete x'), leave.signal);
    await new ServerSentEventReader(first).readUntil('tool_call');

    leave.abort();
    chat.llm.queueTextReply('Nothing is running.');
    const second: Response = await postChatOnceFree(chat, questionBody('what is running?'));
    const secondEvents: ServerSentEvent[] = await new ServerSentEventReader(second).readToEnd();

    assert.deepEqual(chat.tools.calls, []);
    assert.equal(chat.llm.requests.length, 2);
    assert.deepEqual(secondEvents.map((event: ServerSentEvent) => event.event), ['delta', 'done']);
});

/** Posts again while the aborted run is still winding down; the slot is freed in the moment the run settles. */
async function postChatOnceFree(chat: ChatRoutesWithFakes, body: unknown): Promise<Response> {
    for (let attempt = 0; attempt < 100; attempt++) {
        const response: Response = await chat.postChat(body);
        if (response.status !== 429) {
            return response;
        }
        await setImmediate();
    }
    throw new Error('the chat stayed busy after the browser left');
}

function headerOf(response: Response, name: string): string {
    const value: string | null = response.headers.get(name);
    if (value === null) {
        throw new Error(`expected a ${name} header`);
    }
    return value;
}
