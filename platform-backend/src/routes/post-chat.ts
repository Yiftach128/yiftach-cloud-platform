import { Router } from 'express';

import type { ChatDoneEvent, ChatErrorEvent } from '../server-sent-events/interfaces.ts';
import { mapAgentFailureToErrorEvent } from '../server-sent-events/map-agent-failure-to-error-event.ts';
import { ServerSentEventStream } from '../server-sent-events/server-sent-event-stream.ts';
import type { AiAgentChatService } from '../services/ai-agent/ai-agent-chat-service.ts';
import type { AgentEvent, AgentRunRequest, AgentRunResult } from '../services/ai-agent/interfaces.ts';
import { parseChatRequest } from '../services/validation/parse-chat-request.ts';

/**
 * POST /chat — asks the assistant. The body is the whole conversation
 * (`{turns: [{role, text}, ...]}`, the question last) plus the chat's
 * auto-approve switch (`autoApproveToolCalls`, absent → false); the reply is a
 * Server-Sent Events stream: `delta`, `tool_call`, `tool_approval` and
 * `tool_result` while the agent works, then exactly one `done` or `error`. A
 * `tool_call` that needs approval holds the stream until the person answers
 * through POST /chat/approvals (or stops the reply); with auto-approve on,
 * destructive calls run at once and no call waits.
 *
 * Whatever can be refused before the run starts still answers with a status —
 * 400 for a bad body, 429 while another conversation is being answered. Once
 * the stream is open the status is spent, so a failed run ends it with an
 * `error` event instead. The browser closing the connection is the Stop button.
 */
export function postChatRoute(chat: AiAgentChatService): Router {
    return Router().post('/chat', async (req, res) => {
        const request: AgentRunRequest = parseChatRequest(req.body);

        const stream: ServerSentEventStream = new ServerSentEventStream(res);
        const stop: AbortController = new AbortController();
        // Throws AiAgentBusyError here, before the stream opens, so it still reaches the error handler.
        const running: Promise<AgentRunResult> = chat.startRun(
            request,
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
