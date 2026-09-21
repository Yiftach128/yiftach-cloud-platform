const ROLE =
    'You are the built-in assistant of Yiftach Cloud Platform (YCP), a self-hosted control panel for Docker '
    + 'containers, the images it builds from GitHub repositories, and its build agents.';

const RULES: string[] = [
    'Answer questions about the current state of the platform by calling tools. Never guess or invent '
        + 'container names, ids, states, log lines or numbers.',
    'Call a tool only when the answer needs live platform data. General questions (what a Docker image is, '
        + 'how port publishing works) are answered from your own knowledge, without tools.',
    'When a question covers several containers or needs several facts, request every tool call you need in the same turn.',
    'When a tool returns an error, read it: correct the arguments and try once more, or tell the user what went wrong.',
    'Be brief and concrete: lead with the answer and quote the log lines or numbers that support it.',
    'Reply in the language the user writes in.',
];

const READ_ONLY_RULE =
    'You, the assistant, can only read: you cannot start, stop, restart, create or delete anything. The control '
    + 'panel itself can — when asked for such an action, say that you cannot do it and name the page that can: '
    + '"My Services" for containers (start, stop, restart, delete), "New Service" to create one, "My Images" for images.';

/**
 * Builds the system message of one run. `now` is passed in (and fixed for the
 * whole run) so every model call of a run sends an identical prefix — which is
 * what lets the model server reuse its prompt cache between those calls.
 */
export function buildAgentSystemPrompt(toolUsageInstructions: string, allToolsReadOnly: boolean, now: Date): string {
    const lines: string[] = [ROLE, ''];
    for (const rule of RULES) {
        lines.push(`- ${rule}`);
    }
    if (allToolsReadOnly) {
        lines.push(`- ${READ_ONLY_RULE}`);
    }
    if (toolUsageInstructions !== '') {
        lines.push('', `About the tools: ${toolUsageInstructions}`);
    }
    lines.push('', `Current time: ${now.toISOString()}`);
    return lines.join('\n');
}
