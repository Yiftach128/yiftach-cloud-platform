/**
 * Entry point of `npm run eval:rescore`: re-judges every verdict recorded in
 * `evals/results/<model>.json` with the cases and scorers as they are now,
 * then regenerates the table. A record holds the evidence of its run — the
 * tool calls the model made and the reply it wrote — and the verdict is only
 * a judgment of that evidence, so a changed expectation (a phrasing added, an
 * argument no longer held to a value) or a changed scorer is a rescore, not a
 * rerun: no model time, same evidence. `passed` and `reasons` are rewritten;
 * the run's time and Promptfoo eval id stay, because they date the evidence,
 * not the judgment. Each file's provider record (the column's label) is
 * refreshed from the config entry with the same model and variant, so a
 * relabeled column reads right without a run. A recorded id the case list no
 * longer has is left as it is. New cases, and a changed prompt or tool
 * description, still need a run.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutedToolCall } from '../src/services/ai-agent/interfaces.ts';
import type { ToolChoiceCase } from './cases/interfaces.ts';
import { TOOL_CHOICE_CASES } from './cases/tool-choice-cases.ts';
import type { EvalCaseToolCallRecord, EvalModelResults, EvalProviderRecord } from './promptfoo/interfaces.ts';
import { readEvalProviderRecordsFromConfig } from './promptfoo/read-eval-provider-records-from-config.ts';
import { EVAL_RESULTS_DIR, renderEvalResultsTable, toModelResultsFileName } from './promptfoo/render-eval-results-table.ts';
import type { CaseVerdict } from './scoring/interfaces.ts';
import { judgeCaseVerdict } from './scoring/judge-case-verdict.ts';

const casesById = new Map<string, ToolChoiceCase>();
for (const testCase of TOOL_CHOICE_CASES) {
    casesById.set(testCase.id, testCase);
}

const providerByFileName = new Map<string, EvalProviderRecord>();
for (const provider of readEvalProviderRecordsFromConfig()) {
    providerByFileName.set(toModelResultsFileName(provider.model, provider.variant), provider);
}

let verdictsFlipped: number = 0;
let reasonsReworded: number = 0;
let labelsRefreshed: number = 0;
let unlisted: number = 0;
const fileNames: string[] = readdirSync(EVAL_RESULTS_DIR).filter((fileName: string) => fileName.endsWith('.json'));
for (const fileName of fileNames) {
    const filePath: string = join(EVAL_RESULTS_DIR, fileName);
    const results = JSON.parse(readFileSync(filePath, 'utf8')) as EvalModelResults;
    if (results.formatVersion !== 2) {
        throw new Error(`${fileName}: formatVersion ${JSON.stringify(results.formatVersion)} is not 2`);
    }
    const provider: EvalProviderRecord | undefined = providerByFileName.get(fileName);
    if (provider === undefined) {
        console.log(`  ${fileName}: no entry in promptfoo-config.yaml with this model and variant — provider record kept as recorded`);
    } else {
        if (provider.label !== results.provider.label) {
            labelsRefreshed += 1;
            console.log(`  ${fileName}: label ${JSON.stringify(results.provider.label)} → ${JSON.stringify(provider.label)}`);
        }
        results.provider = provider;
    }
    for (const record of results.cases) {
        const testCase: ToolChoiceCase | undefined = casesById.get(record.caseId);
        if (testCase === undefined) {
            unlisted += 1;
            continue;
        }
        const verdict: CaseVerdict = judgeCaseVerdict(testCase, toExecutedToolCalls(record.toolCalls), record.replyText);
        if (verdict.passed !== record.passed) {
            verdictsFlipped += 1;
            console.log(`  ${results.provider.label} — ${record.caseId}: ${describePassed(record.passed)} → ${describePassed(verdict.passed)}`);
        } else if (!sameReasons(verdict.reasons, record.reasons)) {
            reasonsReworded += 1;
        }
        record.passed = verdict.passed;
        record.reasons = verdict.reasons;
    }
    writeFileSync(filePath, JSON.stringify(results, null, 4) + '\n', 'utf8');
}
renderEvalResultsTable(EVAL_RESULTS_DIR);
console.log(
    `eval results: rescored ${fileNames.length} model file(s) — ${verdictsFlipped} verdict(s) changed, `
    + `${reasonsReworded} reason(s) reworded, ${labelsRefreshed} label(s) refreshed, ${unlisted} unlisted case(s) left as recorded; `
    + 'table regenerated → evals/results/README.md',
);

/** The recorded calls as the tool-choice scorer takes them; it reads the name and the arguments, the rest is filled in. */
function toExecutedToolCalls(recorded: EvalCaseToolCallRecord[]): ExecutedToolCall[] {
    return recorded.map((call: EvalCaseToolCallRecord): ExecutedToolCall => ({
        name: call.name,
        arguments: call.arguments,
        isError: call.isError,
        resultText: '',
        approval: call.approval,
    }));
}

function sameReasons(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((reason: string, index: number) => reason === b[index]);
}

function describePassed(passed: boolean): string {
    if (passed) {
        return 'pass';
    }
    return 'fail';
}
