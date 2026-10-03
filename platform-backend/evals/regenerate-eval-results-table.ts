/**
 * Entry point of `npm run eval:table`: rebuilds `evals/results/README.md` from
 * the model files in `evals/results/`. `npm run eval` does this itself after
 * every run; this is for after a model file was removed or edited by hand, or
 * the case list changed (a case moved between categories, a heading reworded).
 */

import { EVAL_RESULTS_DIR, renderEvalResultsTable } from './promptfoo/render-eval-results-table.ts';

renderEvalResultsTable(EVAL_RESULTS_DIR);
console.log('eval results: table regenerated → evals/results/README.md');
