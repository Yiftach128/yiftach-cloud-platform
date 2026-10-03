/**
 * Validates the POST /chat/approvals body: `{callId, decision}` — the call id a
 * `tool_call` event reported, and "approved" or "denied". Throws
 * {@link ValidationError} (→ 400).
 */

import type { ToolCallApprovalAnswer } from '../ai-agent/interfaces.ts';
import { ValidationError } from './validation-error.ts';

export function parseChatApprovalRequest(body: unknown): ToolCallApprovalAnswer {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const callId = record['callId'];
    if (typeof callId !== 'number' || !Number.isInteger(callId) || callId < 1) {
        throw new ValidationError('"callId" must be a positive integer');
    }

    const decision = record['decision'];
    if (decision !== 'approved' && decision !== 'denied') {
        throw new ValidationError('"decision" must be "approved" or "denied"');
    }

    return { callId: callId, decision: decision };
}
