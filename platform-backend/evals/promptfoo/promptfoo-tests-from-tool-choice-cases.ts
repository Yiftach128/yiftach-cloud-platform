import type { TestCase } from 'promptfoo';
import type { ChatTurn } from '../../src/services/ai-agent/interfaces.ts';
import { DEFAULT_REPLY_RUBRIC } from '../cases/default-reply-rubric.ts';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import { TOOL_CHOICE_CASES } from '../cases/tool-choice-cases.ts';

/**
 * The eval cases as Promptfoo tests (`tests: file://...` in
 * `promptfoo-config.yaml`, which calls this default export). The case list
 * stays the one source of truth; this only reshapes it. The case id becomes
 * the description — what `--filter-pattern` matches, and what the assertions
 * find the case by (`read-tool-choice-case-of-row.ts`), so the expectations
 * are not vars and the terminal table shows the inputs only. The prompt and
 * the earlier turns become vars the agent provider reads. The rubric — the
 * case's own, or the default — becomes a var too, for a model-graded judge
 * switched on from the config.
 */
export default async function promptfooTestsFromToolChoiceCases(): Promise<TestCase[]> {
    return TOOL_CHOICE_CASES.map((testCase: ToolChoiceCase) => {
        let precedingTurns: ChatTurn[];
        if (testCase.precedingTurns === undefined) {
            precedingTurns = [];
        } else {
            precedingTurns = testCase.precedingTurns;
        }
        let rubric: string;
        if (testCase.rubric === undefined) {
            rubric = DEFAULT_REPLY_RUBRIC;
        } else {
            rubric = testCase.rubric;
        }
        return {
            description: testCase.id,
            vars: {
                prompt: testCase.prompt,
                precedingTurns: precedingTurns,
                rubric: rubric,
            },
        };
    });
}
