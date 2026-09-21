import type { CallToolResult } from '@modelcontextprotocol/server';

/** Wraps a service result as a successful tool result: the value, as JSON text. */
export function toJsonToolResult(value: unknown): CallToolResult {
    return toTextToolResult(JSON.stringify(value, null, 2));
}

/** Wraps already-rendered text (e.g. log lines) as a successful tool result. */
export function toTextToolResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text: text }] };
}
