import type { AssertionValueFunctionContext } from 'promptfoo';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import { findToolChoiceCaseById } from '../cases/tool-choice-cases.ts';

/**
 * The eval case a Promptfoo row stands for, found by the row's description —
 * the case id, as `promptfoo-tests-from-tool-choice-cases.ts` set it. Both
 * assertions start here; undefined means the row is not one of ours (a test
 * added by hand to the config, or a description edited).
 */
export function readToolChoiceCaseOfRow(context: AssertionValueFunctionContext): ToolChoiceCase | undefined {
    const description: string | undefined = context.test.description;
    if (description === undefined) {
        return undefined;
    }
    return findToolChoiceCaseById(description);
}
