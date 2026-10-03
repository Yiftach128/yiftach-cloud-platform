import type {
    ToolCallApprovalRequest,
    ToolCallApprover,
    ToolCallDecision,
} from '../../../../src/services/ai-agent/interfaces.ts';

/**
 * The tests' `ToolCallApprover`: answers each ask with the next decision the
 * test queued, and keeps every ask, so a test reads which calls were put to
 * the person. With no decision queued the ask stays open until the run's
 * signal aborts, which resolves it as denied — the interface's contract, and
 * the way a test leaves a call waiting.
 */
export class ManualToolCallApprover implements ToolCallApprover {
    /** Every ask, in order. */
    readonly asks: ToolCallApprovalRequest[] = [];
    private readonly decisions: ToolCallDecision[] = [];

    queueDecision(decision: ToolCallDecision): void {
        this.decisions.push(decision);
    }

    requestApproval(request: ToolCallApprovalRequest, signal: AbortSignal): Promise<ToolCallDecision> {
        this.asks.push(request);
        const decision: ToolCallDecision | undefined = this.decisions.shift();
        if (decision !== undefined) {
            return Promise.resolve(decision);
        }
        return new Promise<ToolCallDecision>((resolve: (decision: ToolCallDecision) => void) => {
            if (signal.aborted) {
                resolve('denied');
            } else {
                signal.addEventListener('abort', (): void => resolve('denied'), { once: true });
            }
        });
    }
}
