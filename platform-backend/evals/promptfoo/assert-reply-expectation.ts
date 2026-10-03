import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import type { CaseScore } from '../scoring/interfaces.ts';
import { REPLY_MATCHES_REASON, REPLY_NOT_JUDGED_REASON } from '../scoring/judge-case-verdict.ts';
import { scoreReplyExpectation } from '../scoring/score-reply-expectation.ts';
import { readToolChoiceCaseOfRow } from './read-tool-choice-case-of-row.ts';

/**
 * The Promptfoo assertion of a row's reply text (`type: javascript`, `value:
 * file://assert-reply-expectation.ts` in `promptfoo-config.yaml`), the
 * counterpart of `assert-tool-choice.ts`: the output Promptfoo hands it is
 * the model's final answer, and the row's case (found by its description)
 * says what that answer must and must not say. A case without a reply
 * expectation passes here — its tool choice is all it judges. The rules
 * live in `scoreReplyExpectation` (`../scoring/`), outside Promptfoo.
 */
export default function assertReplyExpectation(output: string, context: AssertionValueFunctionContext): GradingResult {
    const testCase: ToolChoiceCase | undefined = readToolChoiceCaseOfRow(context);
    if (testCase === undefined) {
        return { pass: false, score: 0, reason: `no eval case with id ${JSON.stringify(context.test.description)}` };
    }
    if (testCase.reply === undefined) {
        return { pass: true, score: 1, reason: REPLY_NOT_JUDGED_REASON };
    }
    const score: CaseScore = scoreReplyExpectation(testCase.reply, output);
    if (score.passed) {
        return { pass: true, score: 1, reason: REPLY_MATCHES_REASON };
    }
    return { pass: false, score: 0, reason: score.problems.join('; ') };
}
