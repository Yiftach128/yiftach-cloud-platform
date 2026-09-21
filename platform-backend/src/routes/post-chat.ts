import { Router } from 'express';

import type { ChatDoneEvent, ChatErrorEvent } from '../server-sent-events/interfaces.ts';
import { mapAgentFailureToErrorEvent } from '../server-sent-events/map-agent-failure-to-error-event.ts';
import { ServerSentEventStream } from '../server-sent-events/server-sent-event-stream.ts';
import type { AiAgentChatService } from '../services/ai-agent/ai-agent-chat-service.ts';
import type { AgentEvent, AgentRunResult, ChatTurn } from '../services/ai-agent/interfaces.ts';
import { parseChatRequest } from '../services/validation/parse-chat-request.ts';

/**
 * POST /chat — asks the assistant. The body is the whole conversation
 * (`{turns: [{role, text}, ...]}`, the question last); the reply is a
 * Server-Sent Events stream: `delta`, `tool_call` and `tool_result` while the
 * agent works, then exactly one `done` or `error`.
 *
 * Whatever can be refused before the run starts still answers with a status —
 * 400 for a bad body, 429 while another conversation is being answered. Once
 * the stream is open the status is spent, so a failed run ends it with an
 * `error` event instead. The browser closing the connection is the Stop button.
 */
export function postChatRoute(chat: AiAgentChatService): Router {
    return Router().post('/chat', async (req, res) => {
        const turns: ChatTurn[] = parseChatRequest(req.body);

        const stream: ServerSentEventStream = new ServerSentEventStream(res);
        const stop: AbortController = new AbortController();
        // Throws AiAgentBusyError here, before the stream opens, so it still reaches the error handler.
        const running: Promise<AgentRunResult> = chat.startRun(
            turns,
            (event: AgentEvent): void => stream.send(event.type, event),
            stop.signal,
        );

        stream.open();
        // Fires when the browser leaves mid-reply; after a finished reply it aborts nothing.
        res.on('close', () => stop.abort());

        try {
            const result: AgentRunResult = await running;
            const done: ChatDoneEvent = {
                type: 'done',
                stopReason: result.stopReason,
                modelCalls: result.modelCalls,
                peakPromptTokens: result.peakPromptTokens,
            };
            stream.send(done.type, done);
        } catch (error) {
            const failure: ChatErrorEvent = mapAgentFailureToErrorEvent(error);
            stream.send(failure.type, failure);
        }
        stream.close();
    });
}
