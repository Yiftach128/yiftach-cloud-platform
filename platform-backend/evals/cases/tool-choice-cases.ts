import { ERROR_HANDLING_CASES } from './error-handling-cases.ts';
import { FOLLOW_UP_CASES } from './follow-up-cases.ts';
import type { ToolChoiceCase, ToolChoiceCaseCategory } from './interfaces.ts';
import { NO_TOOL_CASES } from './no-tool-cases.ts';
import { READER_CASES } from './reader-cases.ts';
import { SAFETY_CASES } from './safety-cases.ts';
import { TOOL_CHOICE_CASE_CATEGORIES } from './tool-choice-case-categories.ts';
import { WRITER_CASES } from './writer-cases.ts';

/** Each category's file. Every category in `TOOL_CHOICE_CASE_CATEGORIES` must have one — the list below checks. */
const CASES_BY_CATEGORY_FILE = new Map<ToolChoiceCaseCategory, ToolChoiceCase[]>([
    ['reader', READER_CASES],
    ['no-tool', NO_TOOL_CASES],
    ['writer', WRITER_CASES],
    ['follow-up', FOLLOW_UP_CASES],
    ['error-handling', ERROR_HANDLING_CASES],
    ['safety', SAFETY_CASES],
]);

/**
 * Every eval case, one category file after another in the order of
 * `tool-choice-case-categories.ts`. Kept as plain data — a prompt and what
 * should happen — so any runner can load the same list. The container and
 * image names are the ones `../fakes/canned-platform-tool-results.ts`
 * serves; grafana is the one container there that the platform did not
 * create. Loading the list checks that each file holds only its own
 * category and that no id repeats, so a case filed in the wrong place fails
 * at once instead of showing under the wrong heading.
 */
export const TOOL_CHOICE_CASES: ToolChoiceCase[] = concatenateCategoryFilesInOrder(CASES_BY_CATEGORY_FILE);

/** The case a Promptfoo row stands for: its description is the case id. */
export function findToolChoiceCaseById(caseId: string): ToolChoiceCase | undefined {
    return TOOL_CHOICE_CASES.find((candidate: ToolChoiceCase) => candidate.id === caseId);
}

function concatenateCategoryFilesInOrder(filesByCategory: Map<ToolChoiceCaseCategory, ToolChoiceCase[]>): ToolChoiceCase[] {
    const allCases: ToolChoiceCase[] = [];
    const seenIds = new Set<string>();
    for (const categoryInfo of TOOL_CHOICE_CASE_CATEGORIES) {
        const fileCases: ToolChoiceCase[] | undefined = filesByCategory.get(categoryInfo.category);
        if (fileCases === undefined) {
            throw new Error(`eval cases: no case file registered for category "${categoryInfo.category}"`);
        }
        for (const testCase of fileCases) {
            if (testCase.category !== categoryInfo.category) {
                throw new Error(
                    `eval case "${testCase.id}" says category "${testCase.category}" but sits in the ${categoryInfo.category} file`,
                );
            }
            if (seenIds.has(testCase.id)) {
                throw new Error(`eval case id "${testCase.id}" is used twice`);
            }
            seenIds.add(testCase.id);
            allCases.push(testCase);
        }
    }
    return allCases;
}
