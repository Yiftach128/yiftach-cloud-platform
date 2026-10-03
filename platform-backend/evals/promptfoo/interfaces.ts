/**
 * Types of the Promptfoo suite — the shapes `promptfoo-config.yaml` and the
 * TypeScript it loads (the agent provider, the tests mapper, the assertion,
 * the results hook) agree on. Promptfoo's own types come from the `promptfoo`
 * package.
 */

import type { ApiProvider, EvaluateResult } from 'promptfoo';
import type { AgentStopReason, ExecutedToolCall, ToolCallApprovalOutcome } from '../../src/services/ai-agent/interfaces.ts';

/**
 * The `config` of one provider entry in `promptfoo-config.yaml`: which model
 * client the agent runs on for that column of the results table. Only Ollama
 * exists today; `llm` is here so a second provider is one more literal and a
 * branch in the adapter, not a new config shape. `baseUrl` and `contextTokens`
 * fall back to the backend's own config when absent.
 */
export interface PromptfooAgentProviderConfig {
    llm: 'ollama';
    model: string;
    /**
     * Tells two columns of one model apart — thinking on and off, a
     * tool-result format — in the provider id, the results file
     * (`<model>+<variant>.json`) and the table's legend. Lowercase letters,
     * digits and dashes.
     */
    variant?: string;
    /** Ollama's `think`: reasoning before the answer, for a model that can switch it. Absent, the model's default. */
    think?: boolean;
    baseUrl?: string;
    contextTokens?: number;
}

/**
 * What the agent provider hands Promptfoo beside the reply text — the run as
 * the loop reported it. `assert-tool-choice.ts` scores `toolCalls`; the rest
 * shows in the viewer and the results file.
 */
export interface PromptfooAgentRunMetadata {
    toolCalls: ExecutedToolCall[];
    stopReason: AgentStopReason;
    modelCalls: number;
    peakPromptTokens: number;
}

/**
 * What `record-eval-run-results.ts` reads of Promptfoo's `afterAll` hook
 * context — the subset it needs, typed here because Promptfoo does not export
 * the context type itself.
 */
export interface PromptfooAfterAllHookContext {
    /** Promptfoo's id of the run — the key into `promptfoo view`, where the full rows live. */
    evalId: string;
    results: EvaluateResult[];
    suite: {
        providers: ApiProvider[];
    };
}

/**
 * One model's results — the file format of `evals/results/<model>.json`,
 * written by `record-eval-run-results.ts` and read by
 * `render-eval-results-table.ts`. One file per model, merged: a run replaces
 * the entries of the cases it ran and leaves the rest, so the file always
 * holds the newest verdict per case, each with the time and run it came from,
 * and a batch or a single-case rerun changes cells, never adds files. A
 * distillation of Promptfoo's output, not a copy: what a reader of the repo
 * needs to see what the model did on each case and why it passed or failed.
 */
export interface EvalModelResults {
    formatVersion: 2;
    provider: EvalProviderRecord;
    /** Newest verdict per case, in the case list's order (unknown ids after it, alphabetically). */
    cases: EvalCaseRecord[];
}

/** The model a column stands for: its label in the table and the provider entry's `llm`, `model` and `variant`. */
export interface EvalProviderRecord {
    label: string;
    llm: string;
    model: string;
    /** The entry's `variant`, when the model has more than one column. */
    variant?: string;
}

export interface EvalCaseRecord {
    caseId: string;
    passed: boolean;
    /** The assertion's reasons: the scorer's problems on a failure, what was called on a pass. */
    reasons: string[];
    toolCalls: EvalCaseToolCallRecord[];
    stopReason: AgentStopReason;
    modelCalls: number;
    peakPromptTokens: number;
    latencyMs: number;
    /** The model's final answer, whole. */
    replyText: string;
    /** ISO time of the run that produced this verdict. */
    recordedAt: string;
    /** Promptfoo's id of that run — the key into `promptfoo view`. */
    promptfooEvalId: string;
}

/** One executed tool call as recorded — the result text is left out (canned, and long). */
export interface EvalCaseToolCallRecord {
    name: string;
    arguments: Record<string, unknown>;
    approval: ToolCallApprovalOutcome;
    isError: boolean;
}
