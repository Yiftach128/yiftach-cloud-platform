/**
 * Entry point of `npm run eval:table`: rebuilds `evals/results/README.md` from
 * the run files in `evals/results/runs/`. `npm run eval` does this itself after
 * every run; this is for after a run file was removed or edited by hand.
 */

import { EVAL_RESULTS_DIR, renderEvalResultsTable } from './promptfoo/render-eval-results-table.ts';

renderEvalResultsTable(EVAL_RESULTS_DIR);
console.log('eval results: table regenerated → evals/results/README.md');
