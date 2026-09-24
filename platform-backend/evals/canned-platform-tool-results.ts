import type {
    ContainerListToolResult,
    ContainerStatsToolResult,
    ContainerStatsToolRow,
    ContainerToolDetails,
    ContainerToolSummary,
    ImageToolSummary,
} from '../src/mcp/server/interfaces.ts';
import { renderValueAsToolResultJson } from '../src/mcp/server/tool-results-utils/tool-result-builders.ts';
import { toShortImageId } from '../src/mcp/server/tool-results-utils/tool-result-value-formatters.ts';
import type { ToolCallOutcome } from '../src/services/ai-agent/interfaces.ts';
import type { BuildAgent } from '../src/services/build-agents/interfaces.ts';
import type { ImageDetails } from '../src/services/docker/interfaces.ts';

/**
 * Fixed tool results describing a small made-up platform — four containers
 * (one of them, grafana, not the platform's), two images, one build agent.
 * The tool-choice check answers every call from here, so it needs no Docker
 * daemon and scores the same on every machine.
 *
 * The fixtures are typed against the tools' own result interfaces and
 * serialized by the tools' own JSON renderer: a change to what a tool returns
 * reaches this file as a type error, and a change to how results are rendered
 * reaches it by itself — so the check can never quietly test a shape that no
 * longer exists. The list and stats fixtures also apply the tools' managed-only
 * default and filters, so a case that expects a filter gets an answer the
 * model can reconcile with its question.
 */

const CONTAINERS: ContainerToolSummary[] = [
    { id: '3f2a9c1b7d10', name: 'nginx-web', image: 'cloudplatform/build-yiftach128-site:1a2b3c4', state: 'running', status: 'Up 3 hours', ports: ['8080->80/tcp'], managed: true },
    { id: '8c41d0e2a7f3', name: 'redis-cache', image: 'redis:7', state: 'running', status: 'Up 3 hours', ports: ['6379->6379/tcp'], managed: true },
    { id: 'b7e5f6a19c22', name: 'postgres-db', image: 'postgres:16', state: 'exited', status: 'Exited (1) 12 minutes ago', ports: [], managed: true },
    { id: '5d9e0b3c4a81', name: 'grafana', image: 'grafana/grafana:11.2.0', state: 'running', status: 'Up 2 days', ports: ['3001->3000/tcp'], managed: false },
];

const CONTAINER_DETAILS: ContainerToolDetails[] = [
    {
        id: '3f2a9c1b7d10',
        name: 'nginx-web',
        image: 'cloudplatform/build-yiftach128-site:1a2b3c4',
        imageId: '9a1b2c3d4e5f',
        createdAt: new Date('2026-09-21T06:12:41.000Z'),
        command: 'nginx -g daemon off;',
        workingDir: '',
        user: '',
        state: { status: 'running', exitCode: 0, oomKilled: false, error: '', restartCount: 0, startedAt: new Date('2026-09-21T06:30:02.000Z') },
        ports: ['8080->80/tcp'],
        envNames: ['PATH', 'NGINX_VERSION'],
        labels: {
            'cloudplatform.managed': 'true',
            'cloudplatform.repo-url': 'https://github.com/yiftach128/site',
            'cloudplatform.commit': '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
            'cloudplatform.build-job-id': '6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87',
        },
        restartPolicy: 'unless-stopped',
        networkMode: 'bridge',
        privileged: false,
        mounts: [],
        networks: [{ name: 'bridge', ipAddress: '172.17.0.2', aliases: [] }],
        limits: {},
    },
    {
        id: '8c41d0e2a7f3',
        name: 'redis-cache',
        image: 'redis:7',
        imageId: '7c6b5a4d3e2f',
        createdAt: new Date('2026-09-19T18:04:12.000Z'),
        command: 'docker-entrypoint.sh redis-server',
        workingDir: '/data',
        user: '',
        state: { status: 'running', exitCode: 0, oomKilled: false, error: '', restartCount: 2, startedAt: new Date('2026-09-21T06:30:03.000Z'), finishedAt: new Date('2026-09-21T06:29:58.000Z') },
        ports: ['6379->6379/tcp'],
        envNames: ['PATH', 'GOSU_VERSION', 'REDIS_VERSION'],
        labels: { 'cloudplatform.managed': 'true' },
        restartPolicy: 'unless-stopped',
        networkMode: 'bridge',
        privileged: false,
        mounts: [{ type: 'volume', source: 'redis-data', destination: '/data', readWrite: true }],
        networks: [{ name: 'bridge', ipAddress: '172.17.0.3', aliases: [] }],
        limits: { memoryMiB: 256 },
    },
    {
        id: 'b7e5f6a19c22',
        name: 'postgres-db',
        image: 'postgres:16',
        imageId: '2e3f4a5b6c7d',
        createdAt: new Date('2026-09-19T18:05:40.000Z'),
        command: 'docker-entrypoint.sh postgres',
        workingDir: '',
        user: '',
        state: { status: 'exited', exitCode: 1, oomKilled: false, error: '', restartCount: 0, startedAt: new Date('2026-09-21T09:17:50.000Z'), finishedAt: new Date('2026-09-21T09:17:51.000Z') },
        ports: [],
        envNames: ['PATH', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'PGDATA'],
        labels: { 'cloudplatform.managed': 'true' },
        restartPolicy: 'no',
        networkMode: 'bridge',
        privileged: false,
        mounts: [{ type: 'volume', source: 'postgres-data', destination: '/var/lib/postgresql/data', readWrite: true }],
        networks: [{ name: 'bridge', ipAddress: '', aliases: [] }],
        limits: {},
    },
    {
        id: '5d9e0b3c4a81',
        name: 'grafana',
        image: 'grafana/grafana:11.2.0',
        imageId: 'c4d5e6f7a8b9',
        createdAt: new Date('2026-09-19T08:00:15.000Z'),
        command: '/run.sh',
        workingDir: '/usr/share/grafana',
        user: '472',
        state: {
            status: 'running',
            exitCode: 0,
            oomKilled: false,
            error: '',
            restartCount: 0,
            startedAt: new Date('2026-09-19T08:00:16.000Z'),
            health: { status: 'healthy', failingStreak: 0, lastProbeOutput: 'HTTP/1.1 200 OK' },
        },
        ports: ['3001->3000/tcp'],
        envNames: ['PATH', 'GF_PATHS_DATA', 'GF_PATHS_LOGS', 'GF_SECURITY_ADMIN_PASSWORD'],
        labels: { 'com.docker.compose.project': 'observability', 'com.docker.compose.service': 'grafana' },
        restartPolicy: 'always',
        networkMode: 'observability_default',
        privileged: false,
        mounts: [{ type: 'volume', source: 'observability_grafana-data', destination: '/var/lib/grafana', readWrite: true }],
        networks: [{ name: 'observability_default', ipAddress: '172.19.0.4', aliases: ['grafana'] }],
        limits: {},
    },
];

const STATS: ContainerStatsToolRow[] = [
    { name: 'nginx-web', cpuPercent: 0.12, memoryUsedMiB: 14.3, memoryLimitMiB: 7860, memoryPercent: 0.18 },
    { name: 'redis-cache', cpuPercent: 0.31, memoryUsedMiB: 9.8, memoryLimitMiB: 256, memoryPercent: 3.83 },
    { name: 'grafana', cpuPercent: 0.85, memoryUsedMiB: 112.6, memoryLimitMiB: 7860, memoryPercent: 1.43 },
];

const IMAGES: ImageToolSummary[] = [
    { id: '9a1b2c3d4e5f', tags: ['cloudplatform/build-yiftach128-site:1a2b3c4'], createdAt: new Date('2026-09-20T14:02:11.000Z'), sizeMiB: 61.4, containers: 1 },
    { id: '0f9e8d7c6b5a', tags: ['cloudplatform/build-yiftach128-api:7d8e9f0'], createdAt: new Date('2026-09-18T09:40:55.000Z'), sizeMiB: 148.9, containers: 0 },
];

const IMAGE_DETAILS: ImageDetails[] = [
    {
        id: 'sha256:9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
        tags: ['cloudplatform/build-yiftach128-site:1a2b3c4'],
        createdAt: new Date('2026-09-20T14:02:11.000Z'),
        sizeBytes: 64382976,
        labels: {
            'cloudplatform.managed': 'true',
            'cloudplatform.repo-url': 'https://github.com/yiftach128/site',
            'cloudplatform.commit': '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
            'cloudplatform.build-job-id': '6f1c2a3e-9b8d-4c7e-a5f4-3d2e1c0b9a87',
        },
        exposedPorts: [{ port: 80, protocol: 'tcp' }],
        architecture: 'amd64',
        os: 'linux',
    },
    {
        id: 'sha256:0f9e8d7c6b5a4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e',
        tags: ['cloudplatform/build-yiftach128-api:7d8e9f0'],
        createdAt: new Date('2026-09-18T09:40:55.000Z'),
        sizeBytes: 156134195,
        labels: {
            'cloudplatform.managed': 'true',
            'cloudplatform.repo-url': 'https://github.com/yiftach128/api',
            'cloudplatform.git-ref': 'main',
            'cloudplatform.commit': '7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e',
            'cloudplatform.build-job-id': 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
        },
        exposedPorts: [{ port: 3000, protocol: 'tcp' }],
        architecture: 'amd64',
        os: 'linux',
    },
];

const BUILD_AGENTS: BuildAgent[] = [
    { name: 'builder-1', status: 'idle', startedAt: new Date('2026-09-21T06:12:40.000Z'), lastSeenAt: new Date('2026-09-21T09:30:02.000Z') },
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
        return toJsonOutcome(selectContainers(toolArguments));
    }
    if (name === 'get_container_stats') {
        return toJsonOutcome(selectStats(toolArguments));
    }
    if (name === 'list_images') {
        return toJsonOutcome(IMAGES);
    }
    if (name === 'list_build_agents') {
        return toJsonOutcome(BUILD_AGENTS);
    }
    if (name === 'get_container') {
        const wanted: string = String(toolArguments.container);
        const details: ContainerToolDetails | undefined = CONTAINER_DETAILS.find(
            (candidate: ContainerToolDetails) => candidate.name === wanted || candidate.id === wanted,
        );
        if (details === undefined) {
            return { text: `Not found: No such container: ${wanted}`, isError: true };
        }
        return toJsonOutcome(details);
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
        const image: ImageDetails | undefined = IMAGE_DETAILS.find(
            (candidate: ImageDetails) => toShortImageId(candidate.id) === wanted || candidate.tags.includes(wanted),
        );
        if (image === undefined) {
            return { text: `Not found: No such image: ${wanted}`, isError: true };
        }
        return toJsonOutcome(image);
    }
    return { text: `No canned result for tool "${name}".`, isError: true };
}

/** The list tool's own rules over the fixture: the optional state filter, then the managed-only default. */
function selectContainers(toolArguments: Record<string, unknown>): ContainerListToolResult {
    let candidates: ContainerToolSummary[] = CONTAINERS;
    if (typeof toolArguments.state === 'string') {
        candidates = candidates.filter((container: ContainerToolSummary) => container.state === toolArguments.state);
    }
    let shown: ContainerToolSummary[];
    if (toolArguments.includeUnmanaged === true) {
        shown = candidates;
    } else {
        shown = candidates.filter((container: ContainerToolSummary) => container.managed);
    }
    return { containers: shown, hiddenUnmanagedCount: candidates.length - shown.length };
}

/** The stats tool's managed-only default over the fixture. */
function selectStats(toolArguments: Record<string, unknown>): ContainerStatsToolResult {
    let shown: ContainerStatsToolRow[];
    if (toolArguments.includeUnmanaged === true) {
        shown = STATS;
    } else {
        shown = STATS.filter((row: ContainerStatsToolRow) => isManagedContainerName(row.name));
    }
    return { containers: shown, hiddenUnmanagedCount: STATS.length - shown.length };
}

function isManagedContainerName(name: string): boolean {
    const container: ContainerToolSummary | undefined = CONTAINERS.find(
        (candidate: ContainerToolSummary) => candidate.name === name,
    );
    return container !== undefined && container.managed;
}

function toJsonOutcome(value: unknown): ToolCallOutcome {
    return { text: renderValueAsToolResultJson(value), isError: false };
}
