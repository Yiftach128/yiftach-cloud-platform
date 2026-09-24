/**
 * Public types for the platform's MCP server.
 *
 * The MCP SDK's and zod's types never appear here — both libraries stay inside
 * this folder's implementation files, so nothing outside `src/mcp/` ever
 * depends on either.
 */

import type { BuildAgentRegistry } from '../../services/build-agents/build-agent-registry.ts';
import type { DockerImageService } from '../../services/docker/docker-image-service.ts';
import type { DockerManagerService } from '../../services/docker/docker-manager-service.ts';
import type { ContainerHealthStatus, ContainerState } from '../../services/docker/interfaces.ts';

/** The platform services the MCP tools translate onto. */
export interface PlatformMcpServices {
    docker: DockerManagerService;
    images: DockerImageService;
    buildAgents: BuildAgentRegistry;
}

/**
 * One `list_containers` row — a deliberately small slice of `Container`. Tool
 * results land in a language model's context window, so the list carries only
 * what identifies a container and says how it is doing; `get_container` serves
 * the rest.
 */
export interface ContainerToolSummary {
    /** Docker's 12-character short id; every tool taking a container accepts it. */
    id: string;
    name: string;
    image: string;
    state: ContainerState;
    /** Human-readable status, e.g. "Exited (0) 4 minutes ago". */
    status: string;
    /** `docker ps`-style port strings, e.g. "8080->80/tcp"; an exposed but unpublished port says so. */
    ports: string[];
    /** True when the platform created the container (label cloudplatform.managed=true). */
    managed: boolean;
}

/**
 * What `list_containers` answers with. The rows are the platform's own
 * containers unless the caller asked for every container on the machine; the
 * count of what was left out travels with them, so a model never concludes
 * "nothing is running" from a filtered list.
 */
export interface ContainerListToolResult {
    containers: ContainerToolSummary[];
    /** Containers the platform did not create that the call left out; 0 when they were included or there are none. */
    hiddenUnmanagedCount: number;
}

/** One `get_container_stats` row: a stats sample joined to its container's name. */
export interface ContainerStatsToolRow {
    name: string;
    /** 100 means one full core, as `docker stats` reports it. */
    cpuPercent: number;
    memoryUsedMiB: number;
    memoryLimitMiB: number;
    /** Used memory as a share of the limit, 0-100. */
    memoryPercent: number;
}

/**
 * What `get_container_stats` answers with — the same managed-only default and
 * hidden count as `list_containers`, so the two tools agree on which
 * containers exist.
 */
export interface ContainerStatsToolResult {
    containers: ContainerStatsToolRow[];
    /** Running containers the platform did not create that the call left out; 0 when they were included or there are none. */
    hiddenUnmanagedCount: number;
}

/** The health part of `ContainerToolDetails`: the verdict and the latest probe's output, not the whole probe log. */
export interface ContainerToolHealthView {
    status: ContainerHealthStatus;
    /** Consecutive failed probes so far. */
    failingStreak: number;
    /** Output of the most recent probe, cut to a few hundred characters; empty when no probe has run yet. */
    lastProbeOutput: string;
}

/** The runtime part of `ContainerToolDetails`: what a "why is it down?" question needs. */
export interface ContainerToolStateView {
    status: ContainerState;
    /** Exit code of the last run; 0 while running or never started. */
    exitCode: number;
    /** True when the kernel's OOM killer terminated the container. */
    oomKilled: boolean;
    /** Daemon-reported error from the last start attempt; empty when none. */
    error: string;
    /** Times the daemon restarted the container under its restart policy. */
    restartCount: number;
    /** Unset when the container has never been started. */
    startedAt?: Date;
    /** Unset when the container has never finished a run. */
    finishedAt?: Date;
    /** Present only when the container defines a healthcheck. */
    health?: ContainerToolHealthView;
}

export interface ContainerToolMountView {
    /** "bind", "volume", "tmpfs", ... */
    type: string;
    /** Host path for a bind, volume name for a volume. */
    source: string;
    destination: string;
    readWrite: boolean;
}

export interface ContainerToolNetworkView {
    name: string;
    ipAddress: string;
    /** DNS names the container answers to on this network. */
    aliases: string[];
}

/** Resource limits of `ContainerToolDetails`. A limit that is not set is absent, not 0. */
export interface ContainerToolResourceLimits {
    memoryMiB?: number;
    /** CPU limit in cores, e.g. 1.5. */
    cpus?: number;
    pidsLimit?: number;
}

/**
 * What `get_container` answers with: `ContainerDetails` cut down to what a
 * diagnosis needs. The raw inspect view runs to about 5000 characters per
 * container, most of it zero-valued limits and daemon-internal ids and paths
 * that a model would pay for on every call and never use. Environment
 * variables appear by *name* only: values routinely hold secrets (database
 * passwords, tokens), and a tool result ends up in the context of whatever
 * model the MCP client runs — possibly a hosted one. The REST API still serves
 * the full view to the platform's own UI.
 */
export interface ContainerToolDetails {
    /** Docker's 12-character short id. */
    id: string;
    name: string;
    /** Image reference the container was created from, e.g. "nginx:latest". */
    image: string;
    /** Short image id; `get_image` accepts it when the image is platform-built. */
    imageId: string;
    createdAt: Date;
    /** The process the container runs, with its arguments, as one line. */
    command: string;
    workingDir: string;
    /** User the container process runs as; empty means the image default. */
    user: string;
    state: ContainerToolStateView;
    /** `docker ps`-style port strings, as in `ContainerToolSummary`. */
    ports: string[];
    /** Names of the environment variables; the values are withheld. */
    envNames: string[];
    labels: Record<string, string>;
    /** As `docker run --restart` spells it: "no", "always", "unless-stopped", "on-failure" or "on-failure:<retries>"; empty when unset. */
    restartPolicy: string;
    /** e.g. "bridge", "host", or "container:<id>". */
    networkMode: string;
    privileged: boolean;
    mounts: ContainerToolMountView[];
    networks: ContainerToolNetworkView[];
    limits: ContainerToolResourceLimits;
}

/** One `list_images` row — `ImageSummary` with a short id and a legible size. */
export interface ImageToolSummary {
    /** Docker's 12-character short id; `get_image` accepts it. */
    id: string;
    tags: string[];
    createdAt: Date;
    sizeMiB: number;
    /** Containers created from this image; -1 when the daemon does not compute the count. */
    containers: number;
}
