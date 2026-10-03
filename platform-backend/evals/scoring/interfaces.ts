/**
 * Types of the scorers — what judging one expectation of a case against a
 * run yields. A scorer takes one expectation from a case (`../cases/`) and
 * the part of the run it judges — the tool calls, or the reply text — and
 * answers pass or fail with the reasons; the Promptfoo assertions
 * (`../promptfoo/assert-*.ts`) each read one such verdict.
 */

export interface CaseScore {
    passed: boolean;
    /** Why the case failed, one line per problem; empty when it passed. */
    problems: string[];
}

/**
 * The row verdict of a case against a run, both scorers combined
 * (`judge-case-verdict.ts`) — what a results file records per case.
 */
export interface CaseVerdict {
    passed: boolean;
    /** On a failure, the failing scorers' problems; on a pass, what was called and that the reply matched. */
    reasons: string[];
}
