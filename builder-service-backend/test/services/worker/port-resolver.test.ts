/**
 * The ports a build without a ports list gets: every TCP port the built image
 * exposes, on the same host port unless a container already publishes it, and
 * a log line for every decision. The platform is a
 * `RecordingPlatformApiClient` holding the image's exposed ports and the
 * container list.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PortMapping } from '../../../src/services/platform/interfaces.ts';
import { PlatformApiError } from '../../../src/services/platform/platform-api-error.ts';
import { PortResolver } from '../../../src/services/worker/port-resolver.ts';
import { RecordingPlatformApiClient } from '../platform/fakes/recording-platform-api-client.ts';

const IMAGE_TAG = 'cloudplatform/build-acme-web:1a2b3c4d';

test('each TCP port the image exposes is published on the same host port; an unpublished container port takes nothing', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.exposedPorts = [{ port: 80, protocol: 'tcp' }, { port: 443, protocol: 'tcp' }];
    platform.containers = [{ ports: [{ privatePort: 80, type: 'tcp' }] }];
    const lines: string[] = [];

    const ports: PortMapping[] = await new PortResolver(platform).resolvePorts(IMAGE_TAG, (line: string): void => {
        lines.push(line);
    });

    assert.deepEqual(ports, [
        { hostPort: 80, containerPort: 80 },
        { hostPort: 443, containerPort: 443 },
    ]);
    assert.deepEqual(lines, [
        'Publishing container port 80/tcp on host port 80',
        'Publishing container port 443/tcp on host port 443',
    ]);
    assert.deepEqual(platform.callsTo('getImageExposedPorts'), [[IMAGE_TAG]]);
});

test('a host port a container already publishes is bumped to the next free one, and the log says which was taken', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.exposedPorts = [{ port: 8080, protocol: 'tcp' }];
    platform.containers = [
        { ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }] },
        { ports: [{ privatePort: 3000, publicPort: 8081, type: 'tcp' }] },
    ];
    const lines: string[] = [];

    const ports: PortMapping[] = await new PortResolver(platform).resolvePorts(IMAGE_TAG, (line: string): void => {
        lines.push(line);
    });

    assert.deepEqual(ports, [{ hostPort: 8082, containerPort: 8080 }]);
    assert.deepEqual(lines, ['Publishing container port 8080/tcp on host port 8082 (8080 is taken)']);
});

test('two exposed ports never land on the same host port', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.exposedPorts = [{ port: 80, protocol: 'tcp' }, { port: 81, protocol: 'tcp' }];
    platform.containers = [{ ports: [{ privatePort: 80, publicPort: 80, type: 'tcp' }] }];

    const ports: PortMapping[] = await new PortResolver(platform).resolvePorts(IMAGE_TAG, (): void => {});

    assert.deepEqual(ports, [
        { hostPort: 81, containerPort: 80 },
        { hostPort: 82, containerPort: 81 },
    ]);
});

test('a port exposed on another protocol is not published, and the log says why', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.exposedPorts = [{ port: 53, protocol: 'udp' }, { port: 80, protocol: 'tcp' }];
    const lines: string[] = [];

    const ports: PortMapping[] = await new PortResolver(platform).resolvePorts(IMAGE_TAG, (line: string): void => {
        lines.push(line);
    });

    assert.deepEqual(ports, [{ hostPort: 80, containerPort: 80 }]);
    assert.deepEqual(lines, [
        'Ignoring exposed port 53/udp — only TCP ports are published',
        'Publishing container port 80/tcp on host port 80',
    ]);
});

test('an image exposing no TCP port publishes nothing and never reads the container list', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.exposedPorts = [];
    const lines: string[] = [];

    const ports: PortMapping[] = await new PortResolver(platform).resolvePorts(IMAGE_TAG, (line: string): void => {
        lines.push(line);
    });

    assert.deepEqual(ports, []);
    assert.deepEqual(lines, ['The image exposes no TCP ports — the container starts with nothing published']);
    assert.deepEqual(platform.callsTo('getContainers'), []);
});

test('a failed image lookup fails the resolution with the platform error', async () => {
    const platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    platform.failWith('getImageExposedPorts', new PlatformApiError('No such image: ' + IMAGE_TAG, 404));

    await assert.rejects(new PortResolver(platform).resolvePorts(IMAGE_TAG, (): void => {}), {
        name: 'PlatformApiError',
        message: 'No such image: ' + IMAGE_TAG,
        status: 404,
    });
});
