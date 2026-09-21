import type { ToolCallOutcome } from '../src/services/ai-agent/interfaces.ts';

/**
 * Fixed tool results describing a small made-up platform — four containers, two
 * images, one build agent — shaped like the real tools' output. The tool-choice
 * check answers every call from here, so it needs no Docker daemon and scores
 * the same on every machine.
 */

const CONTAINERS = [
    { id: '3f2a9c1b7d10', name: 'nginx-web', image: 'cloudplatform/build-yiftach128-site:1a2b3c4', state: 'running', status: 'Up 3 hours', ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }], managed: true },
    { id: '8c41d0e2a7f3', name: 'redis-cache', image: 'redis:7', state: 'running', status: 'Up 3 hours', ports: [{ hostPort: 6379, containerPort: 6379, protocol: 'tcp' }], managed: true },
    { id: 'b7e5f6a19c22', name: 'postgres-db', image: 'postgres:16', state: 'exited', status: 'Exited (1) 12 minutes ago', ports: [], managed: true },
    { id: '5d9e0b3c4a81', name: 'grafana', image: 'grafana/grafana:11.2.0', state: 'running', status: 'Up 2 days', ports: [{ hostPort: 3001, containerPort: 3000, protocol: 'tcp' }], managed: false },
];

const STATS = [
    { name: 'nginx-web', cpuPercent: 0.12, memoryUsedMiB: 14.3, memoryLimitMiB: 7860, memoryPercent: 0.18 },
    { name: 'redis-cache', cpuPercent: 0.31, memoryUsedMiB: 9.8, memoryLimitMiB: 7860, memoryPercent: 0.12 },
    { name: 'grafana', cpuPercent: 0.85, memoryUsedMiB: 112.6, memoryLimitMiB: 7860, memoryPercent: 1.43 },
];

const IMAGES = [
    { id: '9a1b2c3d4e5f', tags: ['cloudplatform/build-yiftach128-site:1a2b3c4'], createdAt: '2026-09-20T14:02:11.000Z', sizeMiB: 61.4, containers: 1 },
    { id: '0f9e8d7c6b5a', tags: ['cloudplatform/build-yiftach128-api:7d8e9f0'], createdAt: '2026-09-18T09:40:55.000Z', sizeMiB: 148.9, containers: 0 },
];

const BUILD_AGENTS = [
    { name: 'builder-1', status: 'idle', startedAt: '2026-09-21T06:12:40.000Z', lastSeenAt: '2026-09-21T09:30:02.000Z' },
];

const LOGS: Record<string, string[]> = {
    'nginx-web': [
        '2026-09-21T09:28:01Z [stdout] 172.18.0.1 - - "GET / HTTP/1.1" 200 615',
        '2026-09-21T09:28:04Z [stdout] 172.18.0.1 - - "GET /assets/app.js HTTP/1.1" 200 48213',
        '2026-09-21T09:29:17Z [stderr] 2026/09/21 09:29:17 [error] 29#29: *14 open() "/usr/share/nginx/html/favicon.ico" failed (2: No such file or directory)',
        '2026-09-21T09:29:17Z [stdout] 172.18.0.1 - - "GET /favicon.ico HTTP/1.1" 404 153',
    ],
    'redis-cache': [
        '2026-09-21T06:12:44Z [stdout] 1:M 21 Sep 2026 06:12:44.101 * Ready to accept connections tcp',
        '2026-09-21T07:12:45Z [stdout] 1:M 21 Sep 2026 07:12:45.006 * 1 changes in 3600 seconds. Saving...',
        '2026-09-21T07:12:45Z [stdout] 1:M 21 Sep 2026 07:12:45.120 * Background saving terminated with success',
    ],
    'postgres-db': [
        '2026-09-21T09:17:50Z [stderr] PostgreSQL Database directory appears to contain a database; Skipping initialization',
        '2026-09-21T09:17:51Z [stderr] 2026-09-21 09:17:51.204 UTC [1] LOG:  starting PostgreSQL 16.4',
        '2026-09-21T09:17:51Z [stderr] 2026-09-21 09:17:51.377 UTC [1] FATAL:  could not write lock file "postmaster.pid": No space left on device',
        '2026-09-21T09:17:51Z [stderr] 2026-09-21 09:17:51.378 UTC [1] LOG:  database system is shut down',
    ],
    'grafana': [
        '2026-09-21T09:00:00Z [stdout] logger=cleanup t=2026-09-21T09:00:00Z level=info msg="Completed cleanup jobs" duration=11.2ms',
    ],
};

export function cannedPlatformToolResult(name: string, toolArguments: Record<string, unknown>): ToolCallOutcome {
    if (name === 'list_containers') {
        return toJsonOutcome(CONTAINERS);
    }
    if (name === 'get_container_stats') {
        return toJsonOutcome(STATS);
    }
    if (name === 'list_images') {
        return toJsonOutcome(IMAGES);
    }
    if (name === 'list_build_agents') {
        return toJsonOutcome(BUILD_AGENTS);
    }
    if (name === 'get_container') {
        const wanted: string = String(toolArguments.container);
        const container = CONTAINERS.find((candidate) => candidate.name === wanted || candidate.id === wanted);
        if (container === undefined) {
            return { text: `Not found: No such container: ${wanted}`, isError: true };
        }
        return toJsonOutcome(container);
    }
    if (name === 'get_container_logs') {
        const wanted: string = String(toolArguments.container);
        const lines: string[] | undefined = LOGS[wanted];
        if (lines === undefined) {
            return { text: `Not found: No such container: ${wanted}`, isError: true };
        }
        const header: string = `Last ${lines.length} log lines of container "${wanted}" (oldest first):`;
        return { text: [header].concat(lines).join('\n'), isError: false };
    }
    if (name === 'get_image') {
        const wanted: string = String(toolArguments.image);
        const image = IMAGES.find((candidate) => candidate.id === wanted || candidate.tags.includes(wanted));
        if (image === undefined) {
            return { text: `Not found: No such image: ${wanted}`, isError: true };
        }
        return toJsonOutcome(image);
    }
    return { text: `No canned result for tool "${name}".`, isError: true };
}

function toJsonOutcome(value: unknown): ToolCallOutcome {
    return { text: JSON.stringify(value, null, 2), isError: false };
}
