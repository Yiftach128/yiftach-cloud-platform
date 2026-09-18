/**
 * Resolves which Docker daemon endpoint to talk to, from explicit options — including
 * a docker CLI style `dockerHost` string ("tcp://127.0.0.1:2375", or
 * "unix:///var/run/docker.sock" for a mounted socket) that the composition root
 * supplies from config. Extracted from the manager so the composition root can derive
 * the ping URL — and pick the daemon lifecycle — without duplicating this logic.
 */

import type { DockerEndpoint, ResolveDockerEndpointOptions } from './interfaces.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 2375;
const UNIX_SCHEME = 'unix://';
/** What a bare "unix://" means, as in the docker CLI. */
const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';

/**
 * Malformed dockerHost values are ignored rather than thrown, so a stray value
 * can't break startup.
 */
function parseDockerHost(
    dockerHost: string | undefined,
): { socketPath: string | undefined; host: string | undefined; port: number | undefined } {
    if (dockerHost === undefined || dockerHost === '') {
        return { socketPath: undefined, host: undefined, port: undefined };
    }
    if (dockerHost.startsWith(UNIX_SCHEME)) {
        let socketPath: string = dockerHost.slice(UNIX_SCHEME.length);
        if (socketPath === '') {
            socketPath = DEFAULT_SOCKET_PATH;
        }
        return { socketPath: socketPath, host: undefined, port: undefined };
    }
    try {
        const url = new URL(dockerHost.replace(/^tcp:\/\//, 'http://'));

        let host: string | undefined;
        if (url.hostname === '') {
            host = undefined;
        } else {
            host = url.hostname;
        }

        let port: number | undefined;
        if (url.port === '') {
            port = undefined;
        } else {
            port = Number(url.port);
        }

        return { socketPath: undefined, host: host, port: port };
    } catch {
        return { socketPath: undefined, host: undefined, port: undefined };
    }
}

export function resolveDockerEndpoint(
    options: ResolveDockerEndpointOptions = {},
): DockerEndpoint {
    const parsed = parseDockerHost(options.dockerHost);

    // An explicit host or port means the caller wants TCP, whatever dockerHost says.
    let socketPath: string | undefined;
    if (options.socketPath !== undefined) {
        socketPath = options.socketPath;
    } else if (options.host === undefined && options.port === undefined) {
        socketPath = parsed.socketPath;
    } else {
        socketPath = undefined;
    }

    let host: string;
    if (options.host !== undefined) {
        host = options.host;
    } else if (parsed.host !== undefined) {
        host = parsed.host;
    } else {
        host = DEFAULT_HOST;
    }

    let port: number;
    if (options.port !== undefined) {
        port = options.port;
    } else if (parsed.port !== undefined) {
        port = parsed.port;
    } else {
        port = DEFAULT_PORT;
    }

    const usesTls =
        options.ca !== undefined || options.cert !== undefined || options.key !== undefined;

    let protocol: 'http' | 'https';
    if (options.protocol !== undefined) {
        protocol = options.protocol;
    } else if (usesTls) {
        protocol = 'https';
    } else {
        protocol = 'http';
    }

    let baseUrl: string;
    if (socketPath !== undefined) {
        baseUrl = `${UNIX_SCHEME}${socketPath}`;
    } else {
        baseUrl = `${protocol}://${host}:${port}`;
    }

    return { socketPath: socketPath, host: host, port: port, protocol: protocol, baseUrl: baseUrl };
}
