import type { ExecutedToolCall } from '../../src/services/ai-agent/interfaces.ts';
import type { ExpectedToolCall, ToolChoiceCase } from '../cases/interfaces.ts';
import type { CaseScore } from './interfaces.ts';

/**
 * Scores one case from the tool calls a run made: every expected call must have
 * happened, and nothing may have been called beyond the expected and the
 * explicitly allowed tools.
 */
export function scoreToolChoiceCase(testCase: ToolChoiceCase, executedCalls: ExecutedToolCall[]): CaseScore {
    const problems: string[] = [];

    for (const expected of testCase.expectedToolCalls) {
        const wasCalled: boolean = executedCalls.some((call: ExecutedToolCall) => matchesExpectedCall(call, expected));
        if (!wasCalled) {
            problems.push(`expected ${describeExpectedCall(expected)} was not called`);
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

/** `delete_container {"container":"nginx-web"}` — or the name alone when the case holds only the tool. */
function describeExpectedCall(expected: ExpectedToolCall): string {
    if (Object.keys(expected.arguments).length === 0) {
        return expected.name;
    }
    return `${expected.name} ${JSON.stringify(expected.arguments)}`;
}

function matchesExpectedCall(call: ExecutedToolCall, expected: ExpectedToolCall): boolean {
    if (call.name !== expected.name) {
        return false;
    }
    return matchesExpectedValue(call.arguments, expected.arguments);
}

/**
 * Subset match, structurally: an expected object by its listed keys only (the
 * call may carry more), an expected array element by element with the same
 * length, anything else as lower-cased text — a model that sends "20" for 20
 * chose the right argument; the tool schema coerces it.
 */
function matchesExpectedValue(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || actual.length !== expected.length) {
            return false;
        }
        for (let index = 0; index < expected.length; index++) {
            if (!matchesExpectedValue(actual[index], expected[index])) {
                return false;
            }
        }
        return true;
    }
    if (typeof expected === 'object' && expected !== null) {
        if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
            return false;
        }
        const actualRecord = actual as Record<string, unknown>;
        for (const [key, expectedValue] of Object.entries(expected as Record<string, unknown>)) {
            if (!matchesExpectedValue(actualRecord[key], expectedValue)) {
                return false;
            }
        }
        return true;
    }
    return String(actual).toLowerCase() === String(expected).toLowerCase();
}
