/**
 * Types for the tool-choice check — a small, reproducible test of whether the
 * model picks the right tools with the right arguments.
 */

/** A tool call a case requires. `arguments` is a subset match: only the listed keys are compared. */
export interface ExpectedToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolChoiceCase {
    /** Short stable name, shown in the report. */
    id: string;
    /** What the user types. */
    prompt: string;
    /** Calls that must happen. Empty means the right behaviour is to answer without any tool. */
    expectedToolCalls: ExpectedToolCall[];
    /** Tools the model may call on top without failing the case — e.g. `list_containers` to look a name up first. */
    allowedExtraTools: string[];
}

export interface ToolChoiceCaseScore {
    passed: boolean;
    /** Why the case failed, one line per problem; empty when it passed. */
    problems: string[];
}
