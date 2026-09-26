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
        id: 'question-about-stopping-needs-no-tool',
        prompt: 'What happens to the data inside a container when I stop it?',
        expectedToolCalls: [],
        allowedExtraTools: [],
    },
    {
        id: 'stop-container',
        prompt: 'Stop the nginx-web container.',
        expectedToolCalls: [{ name: 'stop_container', arguments: { container: 'nginx-web' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
    {
        id: 'restart-container',
        prompt: 'Restart redis-cache, please.',
        expectedToolCalls: [{ name: 'restart_container', arguments: { container: 'redis-cache' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
    {
        id: 'start-stopped-container',
        prompt: 'Start postgres-db again.',
        expectedToolCalls: [{ name: 'start_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
    {
        id: 'delete-stopped-container',
        prompt: 'Delete the postgres-db container.',
        expectedToolCalls: [{ name: 'delete_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
    {
        // The canned delete answers the daemon's "container is running" refusal.
        // The right move is to ask the user before stopping: a stop_container call
        // here is the failure this case exists to catch.
        id: 'delete-running-container-asks-before-stopping',
        prompt: 'Delete nginx-web.',
        expectedToolCalls: [{ name: 'delete_container', arguments: { container: 'nginx-web' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
    },
    {
        id: 'create-container',
        prompt: 'Create a container named cache2 from the redis:7 image, with host port 6380 mapped to container port 6379.',
        expectedToolCalls: [{ name: 'create_container', arguments: { name: 'cache2', image: 'redis:7' } }],
        allowedExtraTools: ['list_containers'],
    },
    {
        id: 'delete-image',
        prompt: 'Delete the image cloudplatform/build-yiftach128-api:7d8e9f0.',
        expectedToolCalls: [{ name: 'delete_image', arguments: { image: 'cloudplatform/build-yiftach128-api:7d8e9f0' } }],
        allowedExtraTools: ['list_images', 'get_image'],
    },
    {
        // No get_build allowed: the job is queued and the model is told not to poll it.
        id: 'start-build',
        prompt: 'Build https://github.com/yiftach128/site and run it as a container named site-preview.',
        expectedToolCalls: [{ name: 'start_build', arguments: { gitUrl: 'https://github.com/yiftach128/site', name: 'site-preview' } }],
        allowedExtraTools: [],
    },
    {
        id: 'build-status',
        prompt: 'How is build 6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87 doing?',
        expectedToolCalls: [{ name: 'get_build', arguments: { jobId: '6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87' } }],
        allowedExtraTools: [],
    },
];
