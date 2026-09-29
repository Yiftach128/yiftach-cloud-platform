import type { PromptfooAgentProviderConfig } from './interfaces.ts';

/** The entry's `config` block as YAML delivers it (`unknown`), checked field by field so a typo fails the run at startup, not the model. */
export function parsePromptfooAgentProviderConfig(rawConfig: unknown): PromptfooAgentProviderConfig {
    if (typeof rawConfig !== 'object' || rawConfig === null) {
        throw new Error('promptfoo agent provider: the entry needs a config block with `llm` and `model`');
    }
    const record = rawConfig as Record<string, unknown>;
    if (record.llm !== 'ollama') {
        throw new Error(`promptfoo agent provider: unknown llm ${JSON.stringify(record.llm)} (known: ollama)`);
    }
    if (typeof record.model !== 'string' || record.model === '') {
        throw new Error('promptfoo agent provider: `model` must be a non-empty string');
    }
    const parsed: PromptfooAgentProviderConfig = { llm: 'ollama', model: record.model };
    if (record.variant !== undefined) {
        if (typeof record.variant !== 'string' || !/^[a-z0-9-]+$/.test(record.variant)) {
            throw new Error('promptfoo agent provider: `variant` must be lowercase letters, digits and dashes');
        }
        parsed.variant = record.variant;
    }
    if (record.think !== undefined) {
        if (typeof record.think !== 'boolean') {
            throw new Error('promptfoo agent provider: `think` must be a boolean');
        }
        parsed.think = record.think;
    }
    if (record.baseUrl !== undefined) {
        if (typeof record.baseUrl !== 'string') {
            throw new Error('promptfoo agent provider: `baseUrl` must be a string');
        }
        parsed.baseUrl = record.baseUrl;
    }
    if (record.contextTokens !== undefined) {
        if (typeof record.contextTokens !== 'number') {
            throw new Error('promptfoo agent provider: `contextTokens` must be a number');
        }
        parsed.contextTokens = record.contextTokens;
    }
    return parsed;
}
