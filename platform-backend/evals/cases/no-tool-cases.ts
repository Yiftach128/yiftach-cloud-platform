import type { ToolChoiceCase } from './interfaces.ts';

/** No tool needed: general knowledge the system prompt tells the model to answer from its own, without a call. */
export const NO_TOOL_CASES: ToolChoiceCase[] = [
    {
        id: 'general-knowledge-needs-no-tool',
        category: 'no-tool',
        prompt: 'What is the difference between a Docker image and a container?',
        expectedToolCalls: [],
        allowedExtraTools: [],
    },
    {
        id: 'question-about-stopping-needs-no-tool',
        category: 'no-tool',
        prompt: 'What happens to the data inside a container when I stop it?',
        expectedToolCalls: [],
        allowedExtraTools: [],
    },
];
