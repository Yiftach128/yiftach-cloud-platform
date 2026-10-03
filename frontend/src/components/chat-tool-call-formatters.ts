/** Formatting for the tool-call tags of a chat reply. */

/** Longest an argument value is shown in a tag before it is cut. */
const MAX_VALUE_CHARS: number = 24;

/**
 * A tag's text: the tool's name as the model called it, then its arguments as
 * `key: value` — "get_container_logs name: web-1, tail: 50". A nested value
 * shows as its kind only. The raw name on purpose: the tag is where a reader
 * sees which MCP tool the model reached for.
 */
export function formatToolCallLabel(name: string, toolArguments: Record<string, unknown>): string {
    const summary: string = formatToolCallArgumentsSummary(toolArguments);
    if (summary === '') {
        return name;
    }
    return `${name} ${summary}`;
}

/** The arguments as the details block shows them: pretty-printed JSON, exactly what the tool received. */
export function formatToolCallArgumentsJson(toolArguments: Record<string, unknown>): string {
    return JSON.stringify(toolArguments, null, 2);
}

function formatToolCallArgumentsSummary(toolArguments: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(toolArguments)) {
        parts.push(`${key}: ${formatArgumentValue(value)}`);
    }
    return parts.join(', ');
}

function formatArgumentValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
        return '{…}';
    }
    const text: string = String(value);
    if (text.length > MAX_VALUE_CHARS) {
        return `${text.substring(0, MAX_VALUE_CHARS - 1)}…`;
    }
    return text;
}
