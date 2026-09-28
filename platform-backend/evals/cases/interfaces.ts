/**
 * Types of the eval cases — what a case asks and what it expects, as plain
 * data the Promptfoo suite (`../promptfoo/`) loads. What a run's verdict
 * looks like is `../scoring/interfaces.ts`.
 */

import type { ChatTurn } from '../../src/services/ai-agent/interfaces.ts';

/**
 * What a case probes — the heading it sits under in the results table and
 * the file it lives in (`<category>-cases.ts`, listed in
 * `tool-choice-case-categories.ts`). It names the behaviour asked of the
 * assistant, not the tool the case ends in: a follow-up that ends in a stop
 * is a follow-up case, a stop of a container that does not exist is error
 * handling.
 */
export type ToolChoiceCaseCategory = 'reader' | 'no-tool' | 'writer' | 'follow-up' | 'error-handling' | 'safety';

/** A category as the results table shows it: its heading and one line on what its cases probe. */
export interface ToolChoiceCaseCategoryInfo {
    category: ToolChoiceCaseCategory;
    title: string;
    description: string;
}

/**
 * A tool call a case requires. `arguments` is a subset match: only the listed
 * keys are compared, each structurally — a nested object again by its listed
 * keys, an array element by element, anything else as text (a model that
 * sends "20" for 20 chose the right argument; the tool schema coerces it).
 */
export interface ExpectedToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * What the reply text must and must not say, checked as case-insensitive
 * fragments (`../scoring/score-reply-expectation.ts`). The fragments are
 * values the tool results carry — a number, an error string, a name — which
 * a right answer has to repeat, not the model's wording; an entry given as a
 * list is alternatives of which one must appear (`['9.8 MiB', '9.8 MB']`).
 * `mustNotMention` holds the claims a wrong answer makes ("has been deleted"
 * for a delete the daemon refused): the check that catches an action
 * reported but never run.
 */
export interface ReplyExpectation {
    mustMention: Array<string | string[]>;
    mustNotMention: string[];
}

export interface ToolChoiceCase {
    /** Short stable name, shown in the report. */
    id: string;
    category: ToolChoiceCaseCategory;
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
    /** What the reply must say, when the case judges the text as well as the calls. */
    reply?: ReplyExpectation;
    /**
     * What a right reply does, in plain language, for a model-graded judge.
     * Every row carries its case's rubric — this one, or
     * `DEFAULT_REPLY_RUBRIC` when absent — as a Promptfoo var from the start,
     * so adding a judge (`llm-rubric` with a grading provider) is an entry in
     * `promptfoo-config.yaml`, not a code change. No judge reads it yet.
     */
    rubric?: string;
}
