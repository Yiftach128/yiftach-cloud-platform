/**
 * Public types for the platform's MCP server.
 *
 * The MCP SDK's and zod's types never appear here — both libraries stay inside
 * this folder's implementation files, so nothing outside `src/mcp/` ever
 * depends on either.
 */

import type { BuildAgentRegistry } from '../services/build-agents/build-agent-registry.ts';
import type { DockerImageService } from '../services/docker/docker-image-service.ts';
import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';
import type { ContainerState, PortBinding } from '../services/docker/interfaces.ts';

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
    ports: PortBinding[];
    /** True when the platform created the container (label cloudplatform.managed=true). */
    managed: boolean;
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
