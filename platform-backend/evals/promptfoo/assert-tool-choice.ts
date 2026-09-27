import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import type { ExecutedToolCall } from '../../src/services/ai-agent/interfaces.ts';
import type { ExpectedToolCall, ToolChoiceCase } from '../cases/interfaces.ts';
import type { ToolChoiceCaseScore } from '../scoring/interfaces.ts';
import { scoreToolChoiceCase } from '../scoring/score-tool-choice-case.ts';

/**
 * The Promptfoo assertion of a tool-choice row (`type: javascript`, `value:
 * file://assert-tool-choice.ts` in `promptfoo-config.yaml`). Promptfoo hands it
 * the reply text and a context; the reply text is not what a tool-choice case
 * judges, so it reads the executed tool calls the agent provider put in
 * `metadata` and the case's expectations from the row's vars, and scores them
 * with the same `scoreToolChoiceCase` the terminal check uses — one set of
 * matching rules, two runners.
 */
export default function assertToolChoice(_output: string, context: AssertionValueFunctionContext): GradingResult {
    const toolCalls: ExecutedToolCall[] | undefined = readExecutedToolCalls(context.metadata);
    if (toolCalls === undefined) {
        return { pass: false, score: 0, reason: 'the provider returned no toolCalls metadata — is it the agent provider?' };
    }
    const testCase: ToolChoiceCase = readToolChoiceCaseFromVars(context.vars, context.test.description);
    const score: ToolChoiceCaseScore = scoreToolChoiceCase(testCase, toolCalls);
    let reason: string;
    let value: number;
    if (score.passed) {
        reason = `called ${describeCalls(toolCalls)}`;
        value = 1;
    } else {
        reason = score.problems.join('; ');
        value = 0;
    }
    return { pass: score.passed, score: value, reason: reason };
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

/** The row's vars carry the case as `promptfoo-tests-from-tool-choice-cases.ts` laid it out. */
function readToolChoiceCaseFromVars(vars: Record<string, unknown>, description: string | undefined): ToolChoiceCase {
    let expectedToolCalls: ExpectedToolCall[];
    if (Array.isArray(vars.expectedToolCalls)) {
        expectedToolCalls = vars.expectedToolCalls as ExpectedToolCall[];
    } else {
        expectedToolCalls = [];
    }
    let allowedExtraTools: string[];
    if (Array.isArray(vars.allowedExtraTools)) {
        allowedExtraTools = vars.allowedExtraTools as string[];
    } else {
        allowedExtraTools = [];
    }
    let id: string;
    if (description === undefined) {
        id = '(no description)';
    } else {
        id = description;
    }
    return { id: id, prompt: String(vars.prompt), expectedToolCalls: expectedToolCalls, allowedExtraTools: allowedExtraTools };
}

function describeCalls(toolCalls: ExecutedToolCall[]): string {
    if (toolCalls.length === 0) {
        return 'no tool, as expected';
    }
    return toolCalls.map((call: ExecutedToolCall) => `${call.name} ${JSON.stringify(call.arguments)}`).join(', ');
}
