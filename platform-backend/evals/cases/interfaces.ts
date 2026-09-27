/**
 * Types of the eval cases — what a case asks and what it expects, as plain
 * data every runner (the terminal check, the Promptfoo suite) loads. What a
 * run's verdict looks like is `../scoring/interfaces.ts`.
 */

import type { ChatTurn } from '../../src/services/ai-agent/interfaces.ts';

/** A tool call a case requires. `arguments` is a subset match: only the listed keys are compared. */
export interface ExpectedToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolChoiceCase {
    /** Short stable name, shown in the report. */
    id: string;
    /**
     * The conversation before `prompt`, when the prompt continues one (an
     * earlier question and the assistant's answer, as a chat trace records
     * them). Absent, the prompt opens the chat.
     */
    precedingTurns?: ChatTurn[];
    /** What the user types. */
    prompt: string;
    /** Calls that must happen. Empty means the right behaviour is to answer without any tool. */
    expectedToolCalls: ExpectedToolCall[];
    /** Tools the model may call on top without failing the case — e.g. `list_containers` to look a name up first. */
    allowedExtraTools: string[];
}
