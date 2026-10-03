import type {
    PendingToolCallApproval,
    ToolCallApprovalRequest,
    ToolCallApprover,
    ToolCallDecision,
} from './interfaces.ts';
import { ToolCallApprovalNotPendingError } from './tool-call-approval-not-pending-error.ts';

/**
 * The chat's `ToolCallApprover`: parks a call until the person's answer arrives
 * from the chat UI. The ask itself travels as the `tool_call` event the loop
 * already reports (`needsApproval: true`), so the gate only has to hold the
 * promise; `POST /chat/approvals` resolves it through `answer`.
 *
 * It holds one waiting call at a time — the chat service runs one conversation
 * at a time and the loop asks for one approval at a time — so a call is named
 * by its `callId` alone. Stop, or the tab closing, aborts the run's signal,
 * which resolves the waiting call as denied: nothing runs once the run is over.
 */
export class ToolCallApprovalGate implements ToolCallApprover {
    private pending: PendingToolCallApproval | undefined = undefined;

    requestApproval(request: ToolCallApprovalRequest, signal: AbortSignal): Promise<ToolCallDecision> {
        if (signal.aborted) {
            return Promise.resolve('denied');
        }
        if (this.pending !== undefined) {
            // The loop asks serially, so this is a programming error, not a state to handle.
            return Promise.reject(new Error(
                `Tool call #${request.callId} asked for approval while #${this.pending.callId} was still waiting`,
            ));
        }
        return new Promise<ToolCallDecision>((resolve: (decision: ToolCallDecision) => void) => {
            const settle = (decision: ToolCallDecision): void => {
                signal.removeEventListener('abort', onAbort);
                this.pending = undefined;
                resolve(decision);
            };
            const onAbort = (): void => settle('denied');
            signal.addEventListener('abort', onAbort, { once: true });
            this.pending = { callId: request.callId, resolve: settle };
        });
    }

    /** Hands the person's answer to the waiting call. Throws {@link ToolCallApprovalNotPendingError} when no call with that id waits. */
    answer(callId: number, decision: ToolCallDecision): void {
        if (this.pending === undefined || this.pending.callId !== callId) {
            throw new ToolCallApprovalNotPendingError(callId);
        }
        this.pending.resolve(decision);
    }
}
