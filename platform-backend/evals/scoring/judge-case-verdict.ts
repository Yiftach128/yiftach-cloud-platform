import type { ExecutedToolCall } from '../../src/services/ai-agent/interfaces.ts';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import type { CaseScore, CaseVerdict } from './interfaces.ts';
import { scoreReplyExpectation } from './score-reply-expectation.ts';
import { scoreToolChoiceCase } from './score-tool-choice-case.ts';

/** What a passed reply check says — the Promptfoo assertion and the rescore word it the same way. */
export const REPLY_MATCHES_REASON: string = 'reply says what the case expects';

/** What the reply check says for a case that has no reply expectation. */
export const REPLY_NOT_JUDGED_REASON: string = 'reply not judged (the case has no reply expectation)';

/**
 * The row verdict of one case against one run — the tool calls it made and
 * the reply it gave — as the results files record it: the two scorers
 * combined, and the reasons phrased the way the Promptfoo assertions phrase
 * theirs. On a failure the reasons are the failing scorer's problems only,
 * because the passing scorer's "called …" is not why the row failed; on a
 * pass they say what was called and that the reply matched. The Promptfoo
 * assertions (`../promptfoo/assert-*.ts`) judge live rows one scorer each;
 * `rescore-recorded-eval-results.ts` uses this to re-judge recorded rows.
 */
export function judgeCaseVerdict(testCase: ToolChoiceCase, executedCalls: ExecutedToolCall[], replyText: string): CaseVerdict {
    const toolChoice: CaseScore = scoreToolChoiceCase(testCase, executedCalls);
    let reply: CaseScore;
    if (testCase.reply === undefined) {
        reply = { passed: true, problems: [] };
    } else {
        reply = scoreReplyExpectation(testCase.reply, replyText);
    }
    if (toolChoice.passed && reply.passed) {
        let replyReason: string;
        if (testCase.reply === undefined) {
            replyReason = REPLY_NOT_JUDGED_REASON;
        } else {
            replyReason = REPLY_MATCHES_REASON;
        }
        return { passed: true, reasons: [`called ${describeExecutedCalls(executedCalls)}`, replyReason] };
    }
    const reasons: string[] = [];
    if (!toolChoice.passed) {
        reasons.push(toolChoice.problems.join('; '));
    }
    if (!reply.passed) {
        reasons.push(reply.problems.join('; '));
    }
    return { passed: false, reasons: reasons };
}

/** `list_containers {"state":"running"}, get_container {"container":"nginx-web"}` — or "no tool, as expected" for a run that called none. */
export function describeExecutedCalls(executedCalls: ExecutedToolCall[]): string {
    if (executedCalls.length === 0) {
        return 'no tool, as expected';
    }
    return executedCalls.map((call: ExecutedToolCall) => `${call.name} ${JSON.stringify(call.arguments)}`).join(', ');
}
