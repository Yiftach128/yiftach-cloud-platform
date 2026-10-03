import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import type { ExecutedToolCall } from '../../src/services/ai-agent/interfaces.ts';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import type { CaseScore } from '../scoring/interfaces.ts';
import { describeExecutedCalls } from '../scoring/judge-case-verdict.ts';
import { scoreToolChoiceCase } from '../scoring/score-tool-choice-case.ts';
import { readToolChoiceCaseOfRow } from './read-tool-choice-case-of-row.ts';

/**
 * The Promptfoo assertion of a row's tool choice (`type: javascript`, `value:
 * file://assert-tool-choice.ts` in `promptfoo-config.yaml`). Promptfoo hands
 * it the reply text and a context; the calls, not the text, are what this
 * one judges, so it reads the executed tool calls the agent provider put in
 * `metadata`, finds the row's case by its description, and scores them with
 * `scoreToolChoiceCase` from `../scoring/`, so the matching rules live once,
 * outside Promptfoo. `assert-reply-expectation.ts` is its counterpart for
 * the text.
 */
export default function assertToolChoice(_output: string, context: AssertionValueFunctionContext): GradingResult {
    const toolCalls: ExecutedToolCall[] | undefined = readExecutedToolCalls(context.metadata);
    if (toolCalls === undefined) {
        return { pass: false, score: 0, reason: 'the provider returned no toolCalls metadata — is it the agent provider?' };
    }
    const testCase: ToolChoiceCase | undefined = readToolChoiceCaseOfRow(context);
    if (testCase === undefined) {
        return { pass: false, score: 0, reason: `no eval case with id ${JSON.stringify(context.test.description)}` };
    }
    const score: CaseScore = scoreToolChoiceCase(testCase, toolCalls);
    if (score.passed) {
        return { pass: true, score: 1, reason: `called ${describeExecutedCalls(toolCalls)}` };
    }
    return { pass: false, score: 0, reason: score.problems.join('; ') };
}

function readExecutedToolCalls(metadata: Record<string, unknown> | undefined): ExecutedToolCall[] | undefined {
    if (metadata === undefined) {
        return undefined;
    }
    const toolCalls: unknown = metadata.toolCalls;
    if (!Array.isArray(toolCalls)) {
        return undefined;
    }
    return toolCalls as ExecutedToolCall[];
}

function describeCalls(toolCalls: ExecutedToolCall[]): string {
    if (toolCalls.length === 0) {
        return 'no tool, as expected';
    }
    return toolCalls.map((call: ExecutedToolCall) => `${call.name} ${JSON.stringify(call.arguments)}`).join(', ');
}
