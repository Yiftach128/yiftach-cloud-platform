import { Router } from 'express';

import type { AiAgentChatService } from '../services/ai-agent/ai-agent-chat-service.ts';
import type { ToolCallApprovalAnswer } from '../services/ai-agent/interfaces.ts';
import { parseChatApprovalRequest } from '../services/validation/parse-chat-approval-request.ts';

/**
 * POST /chat/approvals — the person's answer to a tool call the running chat
 * reply is waiting on: `{callId, decision: "approved" | "denied"}`, the
 * `callId` from the stream's `tool_call` event. Answers 204; the decision
 * itself is reported back on the reply's stream as a `tool_approval` event.
 * 400 for a bad body, 409 when no call with that id is waiting (already
 * answered, or the reply was stopped).
 */
export function postChatApprovalRoute(chat: AiAgentChatService): Router {
    return Router().post('/chat/approvals', (req, res) => {
        const answer: ToolCallApprovalAnswer = parseChatApprovalRequest(req.body);
        chat.answerApproval(answer.callId, answer.decision);
        res.status(204).end();
    });
}
