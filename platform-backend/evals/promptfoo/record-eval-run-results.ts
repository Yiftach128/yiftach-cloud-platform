import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiProvider, EvaluateResult } from 'promptfoo';
import type { ExecutedToolCall } from '../../src/services/ai-agent/interfaces.ts';
import type {
    EvalCaseRecord,
    EvalCaseToolCallRecord,
    EvalModelResults,
    EvalProviderRecord,
    PromptfooAfterAllHookContext,
} from './interfaces.ts';
import {
    EVAL_RESULTS_DIR,
    orderCaseIds,
    renderEvalResultsTable,
    toModelResultsFileName,
} from './render-eval-results-table.ts';

/**
 * Promptfoo extension hook (`extensions: [file://record-eval-run-results.ts:afterAll]`
 * in `promptfoo-config.yaml`): the suffix names both the hook and the export
 * Promptfoo looks up, so the function is exported under that name below (and
 * the module has no default export, which would shadow the lookup). It runs
 * once a run has finished — every case, or the few a `--filter-pattern`
 * picked — and folds the run into `evals/results/<model>.json`, one file per
 * model: the cases the run covered replace their entries, the rest stay, so
 * the file always holds the newest verdict per case. Then it regenerates
 * `evals/results/README.md`.
 *
 * The file is a distillation (`EvalModelResults`), not Promptfoo's full
 * output: that is about 10 KB a row and Promptfoo's shape rather than ours,
 * and `promptfoo view` keeps it anyway, reachable by the eval id each verdict
 * carries. What is kept is what a reader of the repo needs — the verdict and
 * its reasons, the tool calls, the reply, the prompt size — small enough to
 * commit after every run.
 *
 * A row whose provider failed (Promptfoo's `error`: the model server was
 * unreachable, the WSL distro froze) is not recorded: no model ran, so it says
 * nothing about the model, and it would replace the last real verdict. It is
 * counted and named on the console instead.
 */
export async function recordEvalRunResultsAfterAll(context: PromptfooAfterAllHookContext): Promise<void> {
    const erroredRows: EvaluateResult[] = context.results.filter(isProviderErrorRow);
    if (erroredRows.length > 0) {
        const caseIds: string = erroredRows.map(describeRow).join(', ');
        console.log(`eval results: ${erroredRows.length} row(s) not recorded — the provider failed before a run: ${caseIds}`);
    }
    const runRows: EvaluateResult[] = context.results.filter((result: EvaluateResult) => !isProviderErrorRow(result));
    if (runRows.length === 0) {
        console.log('eval results: nothing to record (no row ran)');
        return;
    }

    const recordedAt: string = new Date().toISOString();
    mkdirSync(EVAL_RESULTS_DIR, { recursive: true });
    for (const [providerId, rows] of groupRowsByProviderId(runRows)) {
        const firstRow: EvaluateResult | undefined = rows[0];
        if (firstRow === undefined) {
            continue;
        }
        const provider: EvalProviderRecord = describeProvider(providerId, firstRow.provider.label, context.suite.providers);
        const fileName: string = toModelResultsFileName(provider.model);
        const filePath: string = join(EVAL_RESULTS_DIR, fileName);
        const newCases: EvalCaseRecord[] = rows.map((row: EvaluateResult) => toCaseRecord(row, recordedAt, context.evalId));
        const merged: EvalModelResults = mergeIntoModelResults(readModelResults(filePath), provider, newCases);
        writeFileSync(filePath, JSON.stringify(merged, null, 4) + '\n', 'utf8');
        console.log(
            `eval results: ${rows.length} case(s) of ${provider.label} folded into evals/results/${fileName} `
            + `(${merged.cases.length} cases on file)`,
        );
    }

    renderEvalResultsTable(EVAL_RESULTS_DIR);
    console.log('eval results: table regenerated → evals/results/README.md');
}

/** The name Promptfoo resolves from `file://record-eval-run-results.ts:afterAll`. */
export { recordEvalRunResultsAfterAll as afterAll };

/** Promptfoo sets `error` on a row whose provider threw — here, the model server unreachable — and leaves it unset on an assertion failure. */
function isProviderErrorRow(result: EvaluateResult): boolean {
    return typeof result.error === 'string' && result.error !== '';
}

function describeRow(result: EvaluateResult): string {
    if (result.testCase.description === undefined) {
        return `row-${result.testIdx}`;
    }
    return result.testCase.description;
}

/** The rows grouped by the provider entry (the model) that answered them. */
function groupRowsByProviderId(rows: EvaluateResult[]): Map<string, EvaluateResult[]> {
    const rowsByProviderId = new Map<string, EvaluateResult[]>();
    for (const result of rows) {
        let providerId: string;
        if (result.provider.id === undefined) {
            providerId = '(unknown provider)';
        } else {
            providerId = result.provider.id;
        }
        const group: EvaluateResult[] | undefined = rowsByProviderId.get(providerId);
        if (group === undefined) {
            rowsByProviderId.set(providerId, [result]);
        } else {
            group.push(result);
        }
    }
    return rowsByProviderId;
}

/**
 * The model behind a provider id: the label from the row, `llm` and `model`
 * from the provider instance's parsed config (the agent provider exposes it;
 * any other provider reads as unknown).
 */
function describeProvider(providerId: string, label: string | undefined, providers: ApiProvider[]): EvalProviderRecord {
    let resolvedLabel: string;
    if (label === undefined) {
        resolvedLabel = providerId;
    } else {
        resolvedLabel = label;
    }
    let llm: string = 'unknown';
    let model: string = providerId;
    const provider: ApiProvider | undefined = providers.find((candidate: ApiProvider) => candidate.id() === providerId);
    if (provider !== undefined && typeof provider.config === 'object' && provider.config !== null) {
        const providerConfig = provider.config as Record<string, unknown>;
        if (typeof providerConfig.llm === 'string') {
            llm = providerConfig.llm;
        }
        if (typeof providerConfig.model === 'string') {
            model = providerConfig.model;
        }
    }
    return { label: resolvedLabel, llm: llm, model: model };
}

/** The model's file as it is, or nothing when this is its first run. An older format is refused, not silently rewritten. */
function readModelResults(filePath: string): EvalModelResults | undefined {
    if (!existsSync(filePath)) {
        return undefined;
    }
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { formatVersion?: unknown };
    if (parsed.formatVersion !== 2) {
        throw new Error(`${filePath}: formatVersion ${JSON.stringify(parsed.formatVersion)} is not 2 — remove or convert the file`);
    }
    return parsed as EvalModelResults;
}

/** The new verdicts replace the entries of their cases; the other cases stay; the label follows the newest run. */
function mergeIntoModelResults(
    existing: EvalModelResults | undefined,
    provider: EvalProviderRecord,
    newCases: EvalCaseRecord[],
): EvalModelResults {
    const casesById = new Map<string, EvalCaseRecord>();
    if (existing !== undefined) {
        for (const testCase of existing.cases) {
            casesById.set(testCase.caseId, testCase);
        }
    }
    for (const testCase of newCases) {
        casesById.set(testCase.caseId, testCase);
    }
    const orderedCases: EvalCaseRecord[] = [];
    for (const caseId of orderCaseIds(casesById.keys())) {
        const testCase: EvalCaseRecord | undefined = casesById.get(caseId);
        if (testCase !== undefined) {
            orderedCases.push(testCase);
        }
    }
    return { formatVersion: 2, provider: provider, cases: orderedCases };
}

function toCaseRecord(result: EvaluateResult, recordedAt: string, promptfooEvalId: string): EvalCaseRecord {
    let caseId: string;
    if (result.testCase.description === undefined) {
        caseId = `row-${result.testIdx}`;
    } else {
        caseId = result.testCase.description;
    }

    const record: EvalCaseRecord = {
        caseId: caseId,
        passed: result.success,
        reasons: readAssertionReasons(result),
        toolCalls: [],
        stopReason: 'answered',
        modelCalls: 0,
        peakPromptTokens: 0,
        latencyMs: result.latencyMs,
        replyText: '',
        recordedAt: recordedAt,
        promptfooEvalId: promptfooEvalId,
    };
    if (result.response === undefined) {
        return record;
    }
    if (typeof result.response.output === 'string') {
        record.replyText = result.response.output;
    }
    const metadata: Record<string, unknown> | undefined = result.response.metadata;
    if (metadata === undefined) {
        return record;
    }
    if (Array.isArray(metadata.toolCalls)) {
        record.toolCalls = (metadata.toolCalls as ExecutedToolCall[]).map(toToolCallRecord);
    }
    if (typeof metadata.stopReason === 'string') {
        record.stopReason = metadata.stopReason as EvalCaseRecord['stopReason'];
    }
    if (typeof metadata.modelCalls === 'number') {
        record.modelCalls = metadata.modelCalls;
    }
    if (typeof metadata.peakPromptTokens === 'number') {
        record.peakPromptTokens = metadata.peakPromptTokens;
    }
    return record;
}

/** The assertion reasons of a row: one per component when the row had several assertions, else the single reason. */
function readAssertionReasons(result: EvaluateResult): string[] {
    const grading = result.gradingResult;
    if (grading === undefined || grading === null) {
        return [];
    }
    if (grading.componentResults !== undefined && grading.componentResults.length > 0) {
        return grading.componentResults.map((component) => component.reason);
    }
    if (grading.reason === '') {
        return [];
    }
    return [grading.reason];
}

function toToolCallRecord(call: ExecutedToolCall): EvalCaseToolCallRecord {
    return { name: call.name, arguments: call.arguments, approval: call.approval, isError: call.isError };
}
