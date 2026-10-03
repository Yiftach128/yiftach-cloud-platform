/**
 * An approval answer named a tool call that is not waiting for one — already
 * answered, aborted with its run, or never asked. Maps to HTTP 409: the answer
 * is well-formed, it just conflicts with where the conversation is.
 */
export class ToolCallApprovalNotPendingError extends Error {
    /** The call id the answer named. */
    readonly callId: number;

    constructor(callId: number) {
        super(`No tool call #${callId} is waiting for approval`);
        this.name = 'ToolCallApprovalNotPendingError';
        this.callId = callId;
    }
}
