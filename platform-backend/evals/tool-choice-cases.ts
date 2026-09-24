import type { ToolChoiceCase } from './interfaces.ts';

/**
 * The cases of the tool-choice check. Kept as plain data — a prompt and what
 * should be called — so an eval harness can load the same list later. The
 * container and image names are the ones `canned-platform-tool-results.ts`
 * serves; grafana is the one container there that the platform did not create.
 */
export const TOOL_CHOICE_CASES: ToolChoiceCase[] = [
    {
        id: 'list-running-containers',
        prompt: 'Which containers are running right now?',
        expectedToolCalls: [{ name: 'list_containers', arguments: {} }],
        allowedExtraTools: [],
    },
    {
        id: 'list-stopped-containers-uses-state-filter',
        prompt: 'Which containers are stopped?',
        expectedToolCalls: [{ name: 'list_containers', arguments: { state: 'exited' } }],
        allowedExtraTools: [],
    },
    {
        id: 'list-every-container-includes-unmanaged',
        prompt: 'List every container on this machine, including the ones the platform did not create.',
        expectedToolCalls: [{ name: 'list_containers', arguments: { includeUnmanaged: true } }],
        allowedExtraTools: [],
    },
    {
        id: 'diagnose-crashed-container',
        prompt: 'Why did postgres-db crash?',
        expectedToolCalls: [{ name: 'get_container_logs', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['get_container', 'list_containers'],
    },
    {
        id: 'restart-count-needs-container-details',
        prompt: 'How many times has redis-cache been restarted?',
        expectedToolCalls: [{ name: 'get_container', arguments: { container: 'redis-cache' } }],
        allowedExtraTools: ['list_containers'],
    },
    {
        id: 'logs-with-explicit-tail',
        prompt: 'Show me the last 20 log lines of nginx-web.',
        expectedToolCalls: [{ name: 'get_container_logs', arguments: { container: 'nginx-web', tail: 20 } }],
        allowedExtraTools: [],
    },
    {
        id: 'memory-usage',
        prompt: 'How much memory is redis-cache using?',
        expectedToolCalls: [{ name: 'get_container_stats', arguments: {} }],
        allowedExtraTools: ['list_containers'],
    },
    {
        id: 'list-built-images',
        prompt: 'What images has the platform built?',
        expectedToolCalls: [{ name: 'list_images', arguments: {} }],
        allowedExtraTools: [],
    },
    {
        id: 'build-agents-online',
        prompt: 'Are any build agents online?',
        expectedToolCalls: [{ name: 'list_build_agents', arguments: {} }],
        allowedExtraTools: [],
    },
    {
        id: 'two-tools-in-one-question',
        prompt: 'Check the logs of nginx-web and of redis-cache. Are there errors in either?',
        expectedToolCalls: [
            { name: 'get_container_logs', arguments: { container: 'nginx-web' } },
            { name: 'get_container_logs', arguments: { container: 'redis-cache' } },
        ],
        allowedExtraTools: ['list_containers'],
    },
    {
        id: 'general-knowledge-needs-no-tool',
        prompt: 'What is the difference between a Docker image and a container?',
        expectedToolCalls: [],
        allowedExtraTools: [],
    },
    {
        id: 'cannot-mutate',
        prompt: 'Stop the nginx-web container.',
        expectedToolCalls: [],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
];
