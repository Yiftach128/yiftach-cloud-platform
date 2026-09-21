import type { ExecutedToolCall } from '../src/services/ai-agent/interfaces.ts';
import type { ExpectedToolCall, ToolChoiceCase, ToolChoiceCaseScore } from './interfaces.ts';

/**
 * Scores one case from the tool calls a run made: every expected call must have
 * happened, and nothing may have been called beyond the expected and the
 * explicitly allowed tools.
 */
export function scoreToolChoiceCase(testCase: ToolChoiceCase, executedCalls: ExecutedToolCall[]): ToolChoiceCaseScore {
    const problems: string[] = [];

    for (const expected of testCase.expectedToolCalls) {
        const wasCalled: boolean = executedCalls.some((call: ExecutedToolCall) => matchesExpectedCall(call, expected));
        if (!wasCalled) {
            problems.push(`expected ${expected.name} ${JSON.stringify(expected.arguments)} was not called`);
        }
    }

    for (const call of executedCalls) {
        const isExpectedTool: boolean = testCase.expectedToolCalls.some(
            (expected: ExpectedToolCall) => expected.name === call.name,
        );
        const isAllowedExtra: boolean = testCase.allowedExtraTools.includes(call.name);
        if (!isExpectedTool && !isAllowedExtra) {
            problems.push(`unexpected call to ${call.name} ${JSON.stringify(call.arguments)}`);
        }
    }

    return { passed: problems.length === 0, problems: problems };
}

function matchesExpectedCall(call: ExecutedToolCall, expected: ExpectedToolCall): boolean {
    if (call.name !== expected.name) {
        return false;
    }
    for (const [key, expectedValue] of Object.entries(expected.arguments)) {
        // Compared as text: a model that sends "20" for 20 chose the right argument (the tool schemas coerce it).
        const actualText: string = String(call.arguments[key]).toLowerCase();
        const expectedText: string = String(expectedValue).toLowerCase();
        if (actualText !== expectedText) {
            return false;
        }
    }
    return true;
}
