/**
 * The daemon's image wire shapes becoming the platform's `ImageSummary` (the
 * list endpoint) and `ImageDetails` (inspect), plus the two readers the image
 * service uses on an inspect record. Pure; nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    readImageLabels,
    readRepoTags,
    toImageDetails,
    toImageSummary,
    type RawImageDetails,
} from '../../../src/services/docker/image-mapper.ts';
import type { ImageDetails, ImageSummary } from '../../../src/services/docker/interfaces.ts';
import { SAMPLE_CREATED_AT, SAMPLE_IMAGE_ID } from './sample-docker-records.ts';

test('a summary drops the dangling placeholder tag and reports a container count the daemon left out as -1', () => {
    const summary: ImageSummary = toImageSummary({
        Id: SAMPLE_IMAGE_ID,
        Created: SAMPLE_CREATED_AT.getTime() / 1000,
        Size: 1000,
        RepoTags: ['<none>:<none>'],
    });

    assert.deepEqual(summary, {
        id: SAMPLE_IMAGE_ID,
        tags: [],
        createdAt: SAMPLE_CREATED_AT,
        sizeBytes: 1000,
        labels: {},
        containers: -1,
    });
});

test('exposed ports are parsed from the "80/tcp" keys, ascending by port; a bare number means tcp and a non-numeric key is dropped', () => {
    const details: ImageDetails = toImageDetails(rawImageDetailsOf({
        Config: { ExposedPorts: { '443/tcp': {}, '80': {}, '53/udp': {}, 'junk/tcp': {} } },
    }));

    assert.deepEqual(details.exposedPorts, [
        { port: 53, protocol: 'udp' },
        { port: 80, protocol: 'tcp' },
        { port: 443, protocol: 'tcp' },
    ]);
});

test('an inspect record without a config has no labels and no exposed ports; an absent size and time read as -1 and the epoch', () => {
    const details: ImageDetails = toImageDetails({ Id: SAMPLE_IMAGE_ID, Config: null });

    assert.deepEqual(details, {
        id: SAMPLE_IMAGE_ID,
        tags: [],
        createdAt: new Date(0),
        sizeBytes: -1,
        labels: {},
        exposedPorts: [],
        architecture: '',
        os: '',
    });
});

test('the tag and label readers apply the same placeholder and null rules to an inspect record', () => {
    assert.deepEqual(
        readRepoTags(rawImageDetailsOf({ RepoTags: ['<none>:<none>', 'cloudplatform/build-acme-shop:0123456'] })),
        ['cloudplatform/build-acme-shop:0123456'],
    );
    assert.deepEqual(readImageLabels(rawImageDetailsOf({ Config: { Labels: null } })), {});
    assert.deepEqual(
        readImageLabels(rawImageDetailsOf({ Config: { Labels: { 'cloudplatform.managed': 'true' } } })),
        { 'cloudplatform.managed': 'true' },
    );
});

/** An inspect record with only the id, the one field the mapper requires. */
function rawImageDetailsOf(overrides: Partial<RawImageDetails>): RawImageDetails {
    const base: RawImageDetails = { Id: SAMPLE_IMAGE_ID };
    return { ...base, ...overrides };
}
