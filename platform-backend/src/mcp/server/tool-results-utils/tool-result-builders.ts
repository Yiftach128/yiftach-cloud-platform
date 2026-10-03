import type { CallToolResult } from '@modelcontextprotocol/server';

/** Wraps a service result as a successful tool result: the value, as JSON text. */
export function toJsonToolResult(value: unknown): CallToolResult {
    return toTextToolResult(renderValueAsToolResultJson(value));
}

/** Wraps already-rendered text (e.g. log lines) as a successful tool result. */
export function toTextToolResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text: text }] };
}

/**
 * The JSON text a model reads for a value. Exported on its own so the evals'
 * canned results are serialized exactly like the real tools' — this is the
 * one place the indentation, and with it the token cost of every JSON result,
 * is decided.
 */
export function renderValueAsToolResultJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
