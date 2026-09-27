import type { TestCase } from 'promptfoo';
import type { ChatTurn } from '../../src/services/ai-agent/interfaces.ts';
import type { ToolChoiceCase } from '../cases/interfaces.ts';
import { TOOL_CHOICE_CASES } from '../cases/tool-choice-cases.ts';

/**
 * The tool-choice cases as Promptfoo tests (`tests: file://...` in
 * `promptfoo-config.yaml`, which calls this default export). The case list stays
 * the one source of truth; this only reshapes it: the case id becomes the
 * description (what `--filter-pattern` matches), the prompt and the earlier
 * turns become vars the agent provider reads, and the expectations become vars
 * too, so `assert-tool-choice.ts` scores each row against its own case.
 */
export default async function promptfooTestsFromToolChoiceCases(): Promise<TestCase[]> {
    return TOOL_CHOICE_CASES.map((testCase: ToolChoiceCase) => {
        let precedingTurns: ChatTurn[];
        if (testCase.precedingTurns === undefined) {
            precedingTurns = [];
        } else {
            precedingTurns = testCase.precedingTurns;
        }
        return {
            description: testCase.id,
            vars: {
                prompt: testCase.prompt,
                precedingTurns: precedingTurns,
                expectedToolCalls: testCase.expectedToolCalls,
                allowedExtraTools: testCase.allowedExtraTools,
            },
        };
    });
}
