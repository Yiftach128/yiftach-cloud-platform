import type { ToolCallApprovalRequest, ToolCallApprover, ToolCallDecision } from '../../src/services/ai-agent/interfaces.ts';

/**
 * The tool-choice check's `ToolCallApprover`: approves every call. Nothing
 * executes there — every call is answered from canned data — so the question
 * the check asks is only whether the model reached for the right tool.
 */
export class AutoApproveToolCallApprover implements ToolCallApprover {
    async requestApproval(_request: ToolCallApprovalRequest, _signal: AbortSignal): Promise<ToolCallDecision> {
        return 'approved';
    }
}
