import type { ToolChoiceCase } from './interfaces.ts';

/**
 * Error handling: the tool result refuses, or does not answer the question,
 * and the reply must say so rather than paper over it. These cases judge the
 * reply above all; the calls are free within the allowed tools, because
 * more than one honest path exists (look the name up first, or try and be
 * refused).
 */
export const ERROR_HANDLING_CASES: ToolChoiceCase[] = [
    {
        // No container by that name: whether the model tries the stop (and gets "No such
        // container") or lists first and finds nothing, the reply must say it is not there —
        // in whatever words a right answer uses — never a stop that did not happen.
        id: 'stop-unknown-container-reports-not-found',
        category: 'error-handling',
        prompt: 'Stop billing-api.',
        expectedToolCalls: [],
        allowedExtraTools: ['list_containers', 'get_container', 'stop_container'],
        reply: {
            mustMention: [
                'billing-api',
                ['not found', 'no such container', 'does not exist', "doesn't exist", 'not exist', 'no container', 'could not find', "couldn't find",
                    'not listed', "don't see a container", 'do not see a container'],
            ],
            mustNotMention: ['has been stopped', 'successfully stopped', 'stopped successfully', 'is now stopped', 'was stopped'],
        },
        rubric: 'The reply says no container named billing-api exists and does not claim to have stopped anything.',
    },
    {
        // grafana is not the platform's, so the default stats call hides it and answers a
        // hiddenUnmanagedCount; the model must read that and ask again with includeUnmanaged.
        id: 'memory-usage-of-unmanaged-container',
        category: 'error-handling',
        prompt: 'How much memory is grafana using?',
        expectedToolCalls: [{ name: 'get_container_stats', arguments: { includeUnmanaged: true } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: [['112.6']], mustNotMention: [] },
    },
];
