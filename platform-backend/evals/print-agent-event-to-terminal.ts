import type { AgentEvent } from '../src/services/ai-agent/interfaces.ts';

const RESULT_PREVIEW_CHARS = 100;

/**
 * Renders a run's live events for a terminal: the model's text is written as it
 * streams in (so the answer types itself out), and each tool call and result
 * gets a line of its own.
 */
export function printAgentEventToTerminal(event: AgentEvent): void {
    if (event.type === 'delta') {
        process.stdout.write(event.text);
        return;
    }
    if (event.type === 'tool_call') {
        process.stdout.write(`\n    -> #${event.callId} ${event.name} ${JSON.stringify(event.arguments)}\n`);
        return;
    }
    let verdict: string;
    if (event.isError) {
        verdict = 'ERROR';
    } else {
        verdict = 'ok';
    }
    const firstLine: string = event.text.split('\n', 1).join('');
    let preview: string;
    if (firstLine.length > RESULT_PREVIEW_CHARS) {
        preview = `${firstLine.substring(0, RESULT_PREVIEW_CHARS)}...`;
    } else {
        preview = firstLine;
    }
    process.stdout.write(`    <- #${event.callId} ${event.name}: ${verdict}, ${event.text.length} chars  ${preview}\n`);
}
