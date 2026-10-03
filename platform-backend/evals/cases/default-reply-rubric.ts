/**
 * The rubric a case without one of its own hands a model-graded judge: the
 * assistant's general contract, as the system prompt states it. Every row of
 * the Promptfoo suite carries a rubric (`promptfoo-tests-from-tool-choice-cases.ts`
 * puts this one, or the case's own, in the `rubric` var), so a judge can be
 * switched on for the whole suite from the config.
 */
export const DEFAULT_REPLY_RUBRIC: string =
    'The reply answers the request truthfully from the tool results: it reports only what a tool result '
    + 'confirms, says what was not done as not done, and claims no action that did not run.';
