import type { ToolChoiceCase } from './interfaces.ts';

/**
 * Readers: a question one of the read-only tools answers. The reply checks
 * hold the model to the values the canned results carry — the names, the
 * figures, the error line — so a right call followed by a wrong reading fails.
 */
export const READER_CASES: ToolChoiceCase[] = [
    {
        id: 'list-running-containers',
        category: 'reader',
        prompt: 'Which containers are running right now?',
        expectedToolCalls: [{ name: 'list_containers', arguments: {} }],
        allowedExtraTools: [],
        reply: { mustMention: ['nginx-web', 'redis-cache'], mustNotMention: [] },
    },
    {
        id: 'list-stopped-containers-uses-state-filter',
        category: 'reader',
        prompt: 'Which containers are stopped?',
        expectedToolCalls: [{ name: 'list_containers', arguments: { state: 'exited' } }],
        allowedExtraTools: [],
        reply: { mustMention: ['postgres-db'], mustNotMention: [] },
    },
    {
        id: 'list-every-container-includes-unmanaged',
        category: 'reader',
        prompt: 'List every container on this machine, including the ones the platform did not create.',
        expectedToolCalls: [{ name: 'list_containers', arguments: { includeUnmanaged: true } }],
        allowedExtraTools: [],
        reply: { mustMention: ['grafana'], mustNotMention: [] },
    },
    {
        id: 'diagnose-crashed-container',
        category: 'reader',
        prompt: 'Why did postgres-db crash?',
        expectedToolCalls: [{ name: 'get_container_logs', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['get_container', 'list_containers'],
        reply: {
            mustMention: [['no space left on device', 'disk is full', 'disk full', 'full disk', 'out of disk space', 'out of space']],
            mustNotMention: [],
        },
    },
    {
        id: 'restart-count-needs-container-details',
        category: 'reader',
        prompt: 'How many times has redis-cache been restarted?',
        expectedToolCalls: [{ name: 'get_container', arguments: { container: 'redis-cache' } }],
        allowedExtraTools: ['list_containers'],
        reply: {
            mustMention: [['2 times', 'twice', '2 restarts', 'restarted 2', 'restart count of 2', 'restart count: 2', 'restart count is 2', 'restartcount": 2']],
            mustNotMention: [],
        },
    },
    {
        id: 'logs-with-explicit-tail',
        category: 'reader',
        prompt: 'Show me the last 20 log lines of nginx-web.',
        expectedToolCalls: [{ name: 'get_container_logs', arguments: { container: 'nginx-web', tail: 20 } }],
        allowedExtraTools: [],
        reply: { mustMention: ['favicon.ico'], mustNotMention: [] },
    },
    {
        id: 'memory-usage',
        category: 'reader',
        prompt: 'How much memory is redis-cache using?',
        expectedToolCalls: [{ name: 'get_container_stats', arguments: {} }],
        allowedExtraTools: ['list_containers'],
        reply: { mustMention: [['9.8 MiB', '9.8 MB', '9.8MiB', '9.8MB']], mustNotMention: [] },
    },
    {
        id: 'list-built-images',
        category: 'reader',
        prompt: 'What images has the platform built?',
        expectedToolCalls: [{ name: 'list_images', arguments: {} }],
        allowedExtraTools: [],
        reply: { mustMention: ['build-yiftach128-site:1a2b3c4', 'build-yiftach128-api:7d8e9f0'], mustNotMention: [] },
    },
    {
        // The canned agent's heartbeat is seconds old and its status says idle; a reply calling it
        // offline reads the timestamp against "now" and ignores the status the tool derived.
        id: 'build-agents-online',
        category: 'reader',
        prompt: 'Are any build agents online?',
        expectedToolCalls: [{ name: 'list_build_agents', arguments: {} }],
        allowedExtraTools: [],
        reply: {
            mustMention: ['builder-1', ['idle', 'online']],
            mustNotMention: ['no build agents are', 'no agents are online', 'is offline', 'has been offline', 'are offline'],
        },
    },
    {
        id: 'two-tools-in-one-question',
        category: 'reader',
        prompt: 'Check the logs of nginx-web and of redis-cache. Are there errors in either?',
        expectedToolCalls: [
            { name: 'get_container_logs', arguments: { container: 'nginx-web' } },
            { name: 'get_container_logs', arguments: { container: 'redis-cache' } },
        ],
        allowedExtraTools: ['list_containers'],
        reply: { mustMention: ['favicon.ico', 'redis-cache'], mustNotMention: [] },
    },
    {
        id: 'build-status',
        category: 'reader',
        prompt: 'How is build 6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87 doing?',
        expectedToolCalls: [{ name: 'get_build', arguments: { jobId: '6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87' } }],
        allowedExtraTools: [],
        reply: { mustMention: [['succeeded', 'success', 'completed']], mustNotMention: [] },
    },
    {
        // The one tool no other case reaches for: the image detail, where the provenance labels are.
        id: 'image-provenance-needs-image-details',
        category: 'reader',
        prompt: 'Which repository was the image cloudplatform/build-yiftach128-api:7d8e9f0 built from?',
        expectedToolCalls: [{ name: 'get_image', arguments: { image: 'cloudplatform/build-yiftach128-api:7d8e9f0' } }],
        allowedExtraTools: ['list_images'],
        reply: { mustMention: ['github.com/yiftach128/api'], mustNotMention: [] },
    },
    {
        // An open question: the container list is the least a health check reads, and the
        // one container that is not healthy must be in the answer.
        id: 'overview-question-lists-containers',
        category: 'reader',
        prompt: 'Is everything healthy?',
        expectedToolCalls: [{ name: 'list_containers', arguments: {} }],
        allowedExtraTools: ['get_container_stats', 'get_container', 'get_container_logs', 'list_images', 'list_build_agents'],
        reply: { mustMention: ['postgres-db'], mustNotMention: [] },
    },
];
