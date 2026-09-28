import type { ToolChoiceCase } from './interfaces.ts';

/**
 * Writers: a change asked for plainly, against a container or image the
 * canned platform has. The reply checks hold the model to the result the
 * tool returned — the name, and the state the action left behind.
 */
export const WRITER_CASES: ToolChoiceCase[] = [
    {
        id: 'stop-container',
        category: 'writer',
        prompt: 'Stop the nginx-web container.',
        expectedToolCalls: [{ name: 'stop_container', arguments: { container: 'nginx-web' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['nginx-web', ['stopped', 'exited']], mustNotMention: [] },
    },
    {
        id: 'restart-container',
        category: 'writer',
        prompt: 'Restart redis-cache, please.',
        expectedToolCalls: [{ name: 'restart_container', arguments: { container: 'redis-cache' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: [['redis-cache', 'redis cache'], ['restarted', 'now running']], mustNotMention: [] },
    },
    {
        id: 'start-stopped-container',
        category: 'writer',
        prompt: 'Start postgres-db again.',
        expectedToolCalls: [{ name: 'start_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        // "now running" rather than "running": "not in the running containers" must not count as a start.
        reply: { mustMention: ['postgres-db', ['started', 'now running']], mustNotMention: [] },
    },
    {
        id: 'delete-stopped-container',
        category: 'writer',
        prompt: 'Delete the postgres-db container.',
        expectedToolCalls: [{ name: 'delete_container', arguments: { container: 'postgres-db' } }],
        allowedExtraTools: ['list_containers', 'get_container'],
        reply: { mustMention: ['postgres-db', 'deleted'], mustNotMention: [] },
    },
    {
        // The prompt dictates a port mapping, so the call is held to it: the ports array is
        // matched element by element, each mapping by the two keys listed here.
        id: 'create-container',
        category: 'writer',
        prompt: 'Create a container named cache2 from the redis:7 image, with host port 6380 mapped to container port 6379.',
        expectedToolCalls: [{
            name: 'create_container',
            arguments: { name: 'cache2', image: 'redis:7', ports: [{ hostPort: 6380, containerPort: 6379 }] },
        }],
        allowedExtraTools: ['list_containers'],
        reply: { mustMention: ['cache2', '6380'], mustNotMention: [] },
    },
    {
        id: 'delete-image',
        category: 'writer',
        prompt: 'Delete the image cloudplatform/build-yiftach128-api:7d8e9f0.',
        expectedToolCalls: [{ name: 'delete_image', arguments: { image: 'cloudplatform/build-yiftach128-api:7d8e9f0' } }],
        allowedExtraTools: ['list_images', 'get_image'],
        reply: { mustMention: ['7d8e9f0', 'deleted'], mustNotMention: [] },
    },
    {
        // No get_build allowed: the job is queued and the model is told not to poll it.
        id: 'start-build',
        category: 'writer',
        prompt: 'Build https://github.com/yiftach128/site and run it as a container named site-preview.',
        expectedToolCalls: [{ name: 'start_build', arguments: { gitUrl: 'https://github.com/yiftach128/site', name: 'site-preview' } }],
        allowedExtraTools: [],
        reply: {
            mustMention: ['site-preview', ['queued', 'in progress', 'processing', 'started', 'submitted', 'running', 'building']],
            mustNotMention: [],
        },
    },
];
