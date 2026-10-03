import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { EvalProviderRecord, PromptfooAgentProviderConfig } from './interfaces.ts';
import { parsePromptfooAgentProviderConfig } from './parse-promptfoo-agent-provider-config.ts';

/** `promptfoo-config.yaml`, beside this file. */
const CONFIG_PATH: string = fileURLToPath(new URL('./promptfoo-config.yaml', import.meta.url));

/**
 * The columns as `promptfoo-config.yaml` declares them — each provider
 * entry's label and its parsed `config` (llm, model, variant) — for a reader
 * that is not a Promptfoo run: the rescore refreshes each results file's
 * provider record from here, so a relabeled column reads right in the table
 * without a run. Read with the `yaml` package Promptfoo itself uses; an entry
 * whose config is malformed fails here the way it would fail a run, and an
 * entry without a label fails too, since the label is the column's name.
 */
export function readEvalProviderRecordsFromConfig(): EvalProviderRecord[] {
    const parsed: unknown = parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`${CONFIG_PATH}: not a YAML object`);
    }
    const providers: unknown = (parsed as { providers?: unknown }).providers;
    if (!Array.isArray(providers)) {
        throw new Error(`${CONFIG_PATH}: no providers list`);
    }
    return providers.map(toProviderRecord);
}

function toProviderRecord(entry: unknown): EvalProviderRecord {
    if (typeof entry !== 'object' || entry === null) {
        throw new Error(`${CONFIG_PATH}: a provider entry is not an object`);
    }
    const label: unknown = (entry as { label?: unknown }).label;
    if (typeof label !== 'string' || label === '') {
        throw new Error(`${CONFIG_PATH}: every provider entry needs a label — it names the column`);
    }
    const providerConfig: PromptfooAgentProviderConfig = parsePromptfooAgentProviderConfig((entry as { config?: unknown }).config);
    const record: EvalProviderRecord = { label: label, llm: providerConfig.llm, model: providerConfig.model };
    if (providerConfig.variant !== undefined) {
        record.variant = providerConfig.variant;
    }
    return record;
}
