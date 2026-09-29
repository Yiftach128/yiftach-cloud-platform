import type { ToolChoiceCase } from './interfaces.ts';

/**
 * Follow-ups: the prompt continues an earlier exchange, given as
 * `precedingTurns` the way a chat trace records it, and names its target
 * only through that exchange ("it", "the stopped one"). The first case came
 * from a real chat failure; the others probe the same shape.
 */
export const FOLLOW_UP_CASES: ToolChoiceCase[] = [
    {
        // The failure seen in the chat (2026-09-26): asked to stop a container it had just
        // reported on, the model answered that it was stopped without calling anything.
        id: 'stop-container-named-in-earlier-turn',
        category: 'follow-up',
        precedingTurns: [
            { role: 'user', text: 'Is nginx-web running?' },
            { role: 'assistant', text: 'Yes, nginx-web is running (Up 3 hours), publishing 8080->80/tcp.' },
        ],
        prompt: 'Stop it.',
        expectedToolCalls: [{ name: 'stop_container', arguments: { container: 'nginx-web' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['nginx-web', ['stopped', 'exited']], mustNotMention: [] },
    },
    {
        id: 'start-container-diagnosed-in-earlier-turn',
        category: 'follow-up',
        precedingTurns: [
            { role: 'user', text: 'Why did postgres-db crash?' },
            {
                role: 'assistant',
                text: 'postgres-db exited with code 1: PostgreSQL could not write its lock file — "No space left on device". '
                    + 'The disk holding its data volume is full.',
            },
        ],
        prompt: 'I freed some disk space. Start it again.',
        expectedToolCalls: [{ name: 'start_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['postgres-db', ['started', 'now running']], mustNotMention: [] },
    },
    {
        id: 'delete-stopped-container-from-earlier-list',
        category: 'follow-up',
        precedingTurns: [
            { role: 'user', text: 'Which containers do I have?' },
            {
                role: 'assistant',
                text: 'Three: nginx-web (running, Up 3 hours, 8080->80/tcp), redis-cache (running, Up 3 hours, '
                    + '6379->6379/tcp) and postgres-db (exited with code 1, 12 minutes ago).',
            },
        ],
        prompt: 'Delete the stopped one.',
        expectedToolCalls: [{ name: 'delete_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['postgres-db', 'deleted'], mustNotMention: [] },
    },
    {
        // The turn after `delete-running-container-asks-before-stopping`: the user said yes,
        // so now both the stop and the delete must happen. The canned platform remembers
        // the stop within a case, so the delete succeeds as it would on the daemon.
        id: 'stop-then-delete-after-user-confirms',
        category: 'follow-up',
        precedingTurns: [
            { role: 'user', text: 'Delete nginx-web.' },
            {
                role: 'assistant',
                text: 'nginx-web is running, and Docker refuses to delete a running container. '
                    + 'Should I stop it first and then delete it?',
            },
        ],
        prompt: 'Yes.',
        expectedToolCalls: [
            { name: 'stop_container', arguments: { container: 'nginx-web' } },
            { name: 'delete_container', arguments: { container: 'nginx-web' } },
        ],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['nginx-web', 'deleted'], mustNotMention: [] },
    },
];
