/**
 * Types of the scorers — what judging one case against a run yields. A scorer
 * takes a case (`../cases/`) and what the run did, and answers pass or fail
 * with the reasons; both runners (the terminal check and the Promptfoo suite)
 * read the same verdict shape.
 */

export interface ToolChoiceCaseScore {
    passed: boolean;
    /** Why the case failed, one line per problem; empty when it passed. */
    problems: string[];
}
