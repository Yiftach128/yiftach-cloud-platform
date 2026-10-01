/**
 * The diagnostic view get_container and create_container answer: what of the
 * daemon's inspect record a model gets, and what is withheld or converted —
 * environment values, zero-valued limits, a probe's whole output, raw ids.
 * Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ContainerToolDetails } from '../../../../src/mcp/server/interfaces.ts';
import { mapContainerDetailsToToolView } from '../../../../src/mcp/server/tool-results-utils/map-container-details-to-tool-view.ts';
import type { ContainerDetails } from '../../../../src/services/docker/interfaces.ts';
import {
    SAMPLE_CONTAINER_SHORT_ID,
    SAMPLE_CREATED_AT,
    SAMPLE_IMAGE_SHORT_ID,
    sampleContainerDetails,
} from '../../../services/docker/sample-docker-records.ts';

const MEBIBYTE: number = 1024 * 1024;

test('the view of a running container: short ids, the command as one line, env names, docker ps ports, a mount and a network reduced to what identifies them, and no limits when none is set', () => {
    const view: ContainerToolDetails = mapContainerDetailsToToolView(sampleContainerDetails());

    assert.deepEqual(view, {
        id: SAMPLE_CONTAINER_SHORT_ID,
        name: 'web',
        image: 'nginx:1.27',
        imageId: SAMPLE_IMAGE_SHORT_ID,
        createdAt: SAMPLE_CREATED_AT,
        command: 'nginx -g daemon off;',
        workingDir: '/',
        user: '',
        state: {
            status: 'running',
            exitCode: 0,
            oomKilled: false,
            error: '',
            restartCount: 0,
            startedAt: new Date('2026-09-30T08:00:01.000Z'),
        },
        ports: ['8080->80/tcp'],
        envNames: ['PATH', 'NGINX_VERSION'],
        labels: { 'cloudplatform.managed': 'true' },
        restartPolicy: 'unless-stopped',
        networkMode: 'bridge',
        privileged: false,
        mounts: [{ type: 'bind', source: '/srv/web', destination: '/usr/share/nginx/html', readWrite: false }],
        networks: [{ name: 'bridge', ipAddress: '172.17.0.2', aliases: [] }],
        limits: {},
    });
});

test('environment variables appear by name only — the values never leave; an entry without "=" is a bare name', () => {
    const details: ContainerDetails = sampleContainerDetails();
    details.config.env = ['POSTGRES_PASSWORD=hunter2', 'DEBUG'];

    const view: ContainerToolDetails = mapContainerDetailsToToolView(details);

    assert.deepEqual(view.envNames, ['POSTGRES_PASSWORD', 'DEBUG']);
    assert.equal(JSON.stringify(view).includes('hunter2'), false);
});

test('a limit the daemon reports as 0 is absent, not "no memory"; a set one is converted to MiB or cores', () => {
    const details: ContainerDetails = sampleContainerDetails();
    details.hostConfig.memory = 256 * MEBIBYTE;
    details.hostConfig.nanoCpus = 1_500_000_000;
    details.hostConfig.pidsLimit = 100;

    const view: ContainerToolDetails = mapContainerDetailsToToolView(details);

    assert.deepEqual(view.limits, { memoryMiB: 256, cpus: 1.5, pidsLimit: 100 });
});

test('a healthcheck shows its verdict, the failing streak and the last probe\'s output cut to 300 characters; a container without one has no health', () => {
    const details: ContainerDetails = sampleContainerDetails();
    details.state.health = {
        status: 'unhealthy',
        failingStreak: 3,
        log: [
            { startedAt: SAMPLE_CREATED_AT, finishedAt: SAMPLE_CREATED_AT, exitCode: 1, output: 'first probe' },
            { startedAt: SAMPLE_CREATED_AT, finishedAt: SAMPLE_CREATED_AT, exitCode: 1, output: 'y'.repeat(301) },
        ],
    };

    const view: ContainerToolDetails = mapContainerDetailsToToolView(details);

    assert.deepEqual(view.state.health, {
        status: 'unhealthy',
        failingStreak: 3,
        lastProbeOutput: `${'y'.repeat(300)}... [cut]`,
    });
    assert.equal('health' in mapContainerDetailsToToolView(sampleContainerDetails()).state, false);
});

test('the restart policy reads as docker run --restart spells it, the retry count joined to on-failure', () => {
    assert.equal(restartPolicyOf('on-failure', 3), 'on-failure:3');
    assert.equal(restartPolicyOf('on-failure', 0), 'on-failure');
    assert.equal(restartPolicyOf('always', 0), 'always');
    assert.equal(restartPolicyOf('', 0), '');
});

function restartPolicyOf(name: string, maximumRetryCount: number): string {
    const details: ContainerDetails = sampleContainerDetails();
    details.hostConfig.restartPolicy = { name: name, maximumRetryCount: maximumRetryCount };
    return mapContainerDetailsToToolView(details).restartPolicy;
}
