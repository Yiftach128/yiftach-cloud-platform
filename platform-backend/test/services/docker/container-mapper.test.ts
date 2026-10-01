/**
 * The daemon's container wire shapes becoming the platform's `Container` (the
 * list endpoint) and `ContainerDetails` (inspect): what is stripped, what is
 * defaulted and what is parsed. Pure; nothing faked. Each test builds the
 * smallest raw record the mapper accepts plus the field it is about, so the
 * defaults for everything the daemon may omit are on display.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    toContainer,
    toContainerDetails,
    type RawContainerInfo,
    type RawContainerInspectInfo,
} from '../../../src/services/docker/container-mapper.ts';
import type { Container, ContainerDetails } from '../../../src/services/docker/interfaces.ts';
import { SAMPLE_CONTAINER_ID, SAMPLE_CONTAINER_SHORT_ID, SAMPLE_CREATED_AT, SAMPLE_IMAGE_ID } from './sample-docker-records.ts';

test('a list row is named by its first entry without the leading slash; a row the daemon reports without names is named by its short id', () => {
    const named: Container = toContainer(rawInfoOf({ Names: ['/web', '/db/web'] }));
    const nameless: Container = toContainer(rawInfoOf({}));

    assert.equal(named.name, 'web');
    assert.deepEqual(named.names, ['web', 'db/web']);
    assert.equal(nameless.name, SAMPLE_CONTAINER_SHORT_ID);
    assert.deepEqual(nameless.names, []);
});

test("Docker's own networks (bridge, host, none) are not listed as topology", () => {
    const container: Container = toContainer(rawInfoOf({
        NetworkSettings: { Networks: { bridge: {}, 'ycp-net': {}, none: {} } },
    }));

    assert.deepEqual(container.networks, ['ycp-net']);
});

test('collections the daemon omits map to empty values, and the created time is read from unix seconds', () => {
    const container: Container = toContainer(rawInfoOf({}));

    assert.deepEqual(container.ports, []);
    assert.deepEqual(container.labels, {});
    assert.deepEqual(container.networks, []);
    assert.deepEqual(container.createdAt, SAMPLE_CREATED_AT);
});

test('inspect: nested sections the daemon omits map to their defaults rather than a crash', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({}));

    assert.equal(details.name, 'web');
    assert.equal(details.image, '');
    assert.deepEqual(details.state, {
        status: 'dead',
        running: false,
        paused: false,
        restarting: false,
        oomKilled: false,
        dead: false,
        pid: 0,
        exitCode: 0,
        error: '',
        startedAt: undefined,
        finishedAt: undefined,
        health: undefined,
    });
    assert.deepEqual(details.config.entrypoint, []);
    assert.deepEqual(details.hostConfig.restartPolicy, { name: '', maximumRetryCount: 0 });
    assert.deepEqual(details.hostConfig.logConfig, { type: '', driverOptions: {} });
    assert.deepEqual([details.mounts, details.ports, details.networks], [[], [], []]);
});

test('inspect: the year-1 timestamp the daemon uses for "never" reads as undefined', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({
        State: { Status: 'running', Running: true, StartedAt: '2026-09-30T08:00:01.000Z', FinishedAt: '0001-01-01T00:00:00Z' },
    }));

    assert.deepEqual(details.state.startedAt, new Date('2026-09-30T08:00:01.000Z'));
    assert.equal(details.state.finishedAt, undefined);
});

test('inspect: the port map becomes bindings, one per host binding and one for an unpublished port, with host ports as numbers', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({
        NetworkSettings: {
            Ports: {
                '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }, { HostIp: '::', HostPort: '8080' }],
                '443/tcp': null,
            },
        },
    }));

    assert.deepEqual(details.ports, [
        { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' },
        { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '::' },
        { privatePort: 443, type: 'tcp' },
    ]);
});

test('inspect: a string entrypoint becomes a one-element list', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({
        Config: { Entrypoint: '/docker-entrypoint.sh', Cmd: ['nginx', '-g', 'daemon off;'] },
    }));

    assert.deepEqual(details.config.entrypoint, ['/docker-entrypoint.sh']);
    assert.deepEqual(details.config.cmd, ['nginx', '-g', 'daemon off;']);
});

test('inspect: a health probe missing a timestamp (one still running) is dropped from the log', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({
        State: {
            Health: {
                Status: 'unhealthy',
                FailingStreak: 2,
                Log: [
                    { Start: '2026-09-30T08:01:00Z', End: '2026-09-30T08:01:01Z', ExitCode: 1, Output: 'connection refused' },
                    { Start: '2026-09-30T08:02:00Z', End: '0001-01-01T00:00:00Z' },
                ],
            },
        },
    }));

    assert.deepEqual(details.state.health, {
        status: 'unhealthy',
        failingStreak: 2,
        log: [{
            startedAt: new Date('2026-09-30T08:01:00Z'),
            finishedAt: new Date('2026-09-30T08:01:01Z'),
            exitCode: 1,
            output: 'connection refused',
        }],
    });
});

test('inspect: loosely typed host-config lists and maps keep only their string entries', () => {
    const details: ContainerDetails = toContainerDetails(rawInspectOf({
        HostConfig: {
            CapAdd: ['NET_ADMIN', 7, null],
            CapDrop: null,
            LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': 3 } },
        },
    }));

    assert.deepEqual(details.hostConfig.capAdd, ['NET_ADMIN']);
    assert.deepEqual(details.hostConfig.capDrop, []);
    assert.deepEqual(details.hostConfig.logConfig, { type: 'json-file', driverOptions: { 'max-size': '10m' } });
});

/** The list endpoint's record with only the fields dockerode declares required. */
function rawInfoOf(overrides: Partial<RawContainerInfo>): RawContainerInfo {
    const base: RawContainerInfo = {
        Id: SAMPLE_CONTAINER_ID,
        Image: 'nginx:1.27',
        ImageID: SAMPLE_IMAGE_ID,
        Command: 'nginx -g daemon off;',
        Created: SAMPLE_CREATED_AT.getTime() / 1000,
        State: 'running',
        Status: 'Up 2 hours',
    };
    return { ...base, ...overrides };
}

/** The inspect endpoint's record with only the identity fields the mapper trusts. */
function rawInspectOf(overrides: Partial<RawContainerInspectInfo>): RawContainerInspectInfo {
    const base: RawContainerInspectInfo = {
        Id: SAMPLE_CONTAINER_ID,
        Created: '2026-09-30T08:00:00.000Z',
        Path: 'nginx',
        Name: '/web',
        Image: SAMPLE_IMAGE_ID,
    };
    return { ...base, ...overrides };
}
