import { createInterface } from 'node:readline';
import type { Interface } from 'node:readline';

import type { ToolCallApprovalRequest, ToolCallApprover, ToolCallDecision } from '../src/services/ai-agent/interfaces.ts';

/**
 * The terminal's `ToolCallApprover`, for `ask:ai-agent`: prints the call and
 * reads one line from stdin — "y" or "yes" approves, anything else denies.
 * Ctrl+C while the question waits is the Stop button here as in the chat: the
 * call is denied and the script's own SIGINT handler aborts the run.
 */
export class TerminalToolCallApprover implements ToolCallApprover {
    requestApproval(request: ToolCallApprovalRequest, signal: AbortSignal): Promise<ToolCallDecision> {
        if (signal.aborted) {
            return Promise.resolve('denied');
        }
        let warning: string;
        if (request.destructive) {
            warning = ' [destructive]';
        } else {
            warning = '';
        }
        const question: string =
            `\n    ?  #${request.callId} ${request.name} ${JSON.stringify(request.arguments)}${warning}\n`
            + '       run it? [y/N] ';

        return new Promise<ToolCallDecision>((resolve: (decision: ToolCallDecision) => void) => {
            const prompt: Interface = createInterface({ input: process.stdin, output: process.stdout });
            const settle = (decision: ToolCallDecision): void => {
                signal.removeEventListener('abort', onAbort);
                prompt.close();
                resolve(decision);
            };
            const onAbort = (): void => settle('denied');
            signal.addEventListener('abort', onAbort, { once: true });
            // readline takes Ctrl+C for itself while it reads a line; re-raised so
            // the script's SIGINT handler still aborts the run.
            prompt.on('SIGINT', () => {
                settle('denied');
                process.emit('SIGINT', 'SIGINT');
            });
            prompt.question(question, (answer: string) => settle(toDecision(answer)));
        });
    }
}

function toDecision(answer: string): ToolCallDecision {
    const normalized: string = answer.trim().toLowerCase();
    if (normalized === 'y' || normalized === 'yes') {
        return 'approved';
    }
    return 'denied';
}
