/**
 * Env-driven startup configuration — the one module that reads process.env.
 * It loads `.env` itself, at the top, because ESM import hoisting evaluates
 * this module before any statement in main.ts runs. This file is the `||`
 * defaulting carve-out in the code conventions, and IConfig lives in-file as
 * a deliberate exception to the types-live-in-interfaces.ts rule.
 */

import { existsSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load builder-service-backend/.env (sits next to package.json, two levels
// above this file) if present. Real environment variables take precedence
// over file values; a missing .env just means defaults.
const envFile: string = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

export interface IConfig {
    /** Platform API base URL, including the version prefix. */
    PLATFORM_API_URL: string;
    /**
     * Docker daemon endpoint as configured, docker CLI style: tcp://127.0.0.1:2375
     * or unix:///var/run/docker.sock (a mounted socket).
     */
    DOCKER_HOST: string;
    /** Unix socket path parsed out of DOCKER_HOST; undefined for a tcp:// endpoint. */
    DOCKER_SOCKET_PATH: string | undefined;
    /** Host name parsed out of DOCKER_HOST; undefined for a unix:// endpoint. */
    DOCKER_HOST_NAME: string | undefined;
    /** Port parsed out of DOCKER_HOST; undefined for a unix:// endpoint. */
    DOCKER_HOST_PORT: number | undefined;
    /** How long to wait between claim polls when the queue is empty (milliseconds). */
    POLL_INTERVAL_MS: number;
    /** Name this builder reports itself as; defaults to the machine hostname. */
    AGENT_NAME: string;
    /** How often the builder heartbeats the platform (milliseconds). */
    HEARTBEAT_INTERVAL_MS: number;
    /** Directory that holds the per-build clone workspaces. */
    WORKSPACE_DIR: string;
    /** Hard cap on a single git clone (milliseconds). */
    GIT_CLONE_TIMEOUT_MS: number;
}

const UNIX_SCHEME = 'unix://';
/** What a bare "unix://" means, as in the docker CLI. */
const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';

/** The daemon speaks HTTP on the TCP port, so tcp:// parses as an http URL. */
function parseTcpDockerHost(dockerHost: string): URL {
    const normalized: string = dockerHost.replace(/^tcp:\/\//, 'http://');
    let endpoint: URL;
    try {
        endpoint = new URL(normalized);
    } catch {
        throw new Error(`DOCKER_HOST is not a valid endpoint: "${dockerHost}"`);
    }
    // e.g. "unix:/var/run/docker.sock" (one slash) parses, but names no host.
    if (endpoint.hostname === '') {
        throw new Error(`DOCKER_HOST is not a valid endpoint: "${dockerHost}"`);
    }
    return endpoint;
}

// DOCKER_SOCKET_PATH / DOCKER_HOST_NAME / DOCKER_HOST_PORT are derived, so the
// endpoint resolves into named locals first (fail-fast on a malformed value),
// then the literal. Exactly one side is set: the socket path, or host and port.
const dockerHost: string = process.env.DOCKER_HOST || 'tcp://127.0.0.1:2375';
let dockerSocketPath: string | undefined;
let dockerHostName: string | undefined;
let dockerHostPort: number | undefined;
if (dockerHost.startsWith(UNIX_SCHEME)) {
    dockerSocketPath = dockerHost.slice(UNIX_SCHEME.length) || DEFAULT_SOCKET_PATH;
    dockerHostName = undefined;
    dockerHostPort = undefined;
} else {
    const dockerEndpoint: URL = parseTcpDockerHost(dockerHost);
    dockerSocketPath = undefined;
    dockerHostName = dockerEndpoint.hostname;
    dockerHostPort = Number(dockerEndpoint.port || '2375');
}

export const config: IConfig = {
    PLATFORM_API_URL: process.env.PLATFORM_API_URL || 'http://127.0.0.1:3000/api/v1',
    DOCKER_HOST: dockerHost,
    DOCKER_SOCKET_PATH: dockerSocketPath,
    DOCKER_HOST_NAME: dockerHostName,
    DOCKER_HOST_PORT: dockerHostPort,
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS || '2000'),
    AGENT_NAME: process.env.AGENT_NAME || hostname(),
    HEARTBEAT_INTERVAL_MS: Number(process.env.HEARTBEAT_INTERVAL_MS || '10000'),
    WORKSPACE_DIR: process.env.WORKSPACE_DIR || join(tmpdir(), 'cloudplatform-builder'),
    GIT_CLONE_TIMEOUT_MS: Number(process.env.GIT_CLONE_TIMEOUT_MS || '120000'),
};

console.log('config:', config);
