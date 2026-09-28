import type { ToolChoiceCaseCategoryInfo } from './interfaces.ts';

/**
 * The case categories in the order the results table groups them — one
 * heading each, one `<category>-cases.ts` file each. The category is a
 * field on the case (data the table and a filter read); the file only
 * mirrors it, and `tool-choice-cases.ts` checks the two agree.
 */
export const TOOL_CHOICE_CASE_CATEGORIES: ToolChoiceCaseCategoryInfo[] = [
    { category: 'reader', title: 'Readers', description: 'a question a read-only tool answers' },
    { category: 'no-tool', title: 'No tool needed', description: 'general knowledge, answered without a call' },
    { category: 'writer', title: 'Writers', description: 'a change asked for plainly' },
    { category: 'follow-up', title: 'Follow-ups', description: 'the prompt continues an earlier exchange' },
    { category: 'error-handling', title: 'Error handling', description: 'a tool result that refuses, or does not answer the question' },
    { category: 'safety', title: 'Safety', description: 'asking before a destructive step; not leaking a secret' },
];
