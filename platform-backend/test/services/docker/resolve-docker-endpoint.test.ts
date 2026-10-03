/**
 * How the configured `DOCKER_HOST` string and the explicit options become the
 * one endpoint the services and the composition root agree on. Pure; nothing
 * faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DockerEndpoint } from '../../../src/services/docker/interfaces.ts';
import { resolveDockerEndpoint } from '../../../src/services/docker/resolve-docker-endpoint.ts';

const DEFAULT_ENDPOINT: DockerEndpoint = {
    socketPath: undefined,
    host: '127.0.0.1',
    port: 2375,
    protocol: 'http',
    baseUrl: 'http://127.0.0.1:2375',
};

test('a tcp:// docker host names the host and port; nothing given means 127.0.0.1:2375 over http', () => {
    assert.deepEqual(resolveDockerEndpoint({ dockerHost: 'tcp://192.168.1.5:2376' }), {
        socketPath: undefined,
        host: '192.168.1.5',
        port: 2376,
        protocol: 'http',
        baseUrl: 'http://192.168.1.5:2376',
    });
    assert.deepEqual(resolveDockerEndpoint(), DEFAULT_ENDPOINT);
});

test('a unix:// docker host is a socket path with a unix:// display url; a bare unix:// means /var/run/docker.sock', () => {
    const mounted: DockerEndpoint = resolveDockerEndpoint({ dockerHost: 'unix:///var/run/docker.sock' });
    const bare: DockerEndpoint = resolveDockerEndpoint({ dockerHost: 'unix://' });

    assert.equal(mounted.socketPath, '/var/run/docker.sock');
    assert.equal(mounted.baseUrl, 'unix:///var/run/docker.sock');
    assert.equal(bare.socketPath, '/var/run/docker.sock');
});

test('a malformed docker host is ignored, so a stray value cannot break startup', () => {
    assert.deepEqual(resolveDockerEndpoint({ dockerHost: 'not a url at all' }), DEFAULT_ENDPOINT);
});

test('an explicit host or port wins over the docker host string and means tcp, even when the string names a socket; an explicit socket path wins the other way', () => {
    const explicitHost: DockerEndpoint = resolveDockerEndpoint({ dockerHost: 'unix:///var/run/docker.sock', host: '10.0.0.2' });
    const explicitSocket: DockerEndpoint = resolveDockerEndpoint({ dockerHost: 'tcp://10.0.0.2:2375', socketPath: '/tmp/docker.sock' });

    assert.deepEqual(explicitHost, {
        socketPath: undefined,
        host: '10.0.0.2',
        port: 2375,
        protocol: 'http',
        baseUrl: 'http://10.0.0.2:2375',
    });
    assert.equal(explicitSocket.socketPath, '/tmp/docker.sock');
    assert.equal(explicitSocket.baseUrl, 'unix:///tmp/docker.sock');
});

test('TLS material switches the protocol to https unless one is given', () => {
    assert.equal(resolveDockerEndpoint({ dockerHost: 'tcp://10.0.0.2:2376', ca: 'CA PEM' }).baseUrl, 'https://10.0.0.2:2376');
    assert.equal(resolveDockerEndpoint({ ca: 'CA PEM', protocol: 'http' }).protocol, 'http');
});
