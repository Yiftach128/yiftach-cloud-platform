/**
 * The one place service errors become MCP tool errors: the words a model
 * reads for each error class, always in band (`isError: true`), never
 * thrown. Pure; nothing faked — the tool calls are functions that throw.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CallToolResult } from '@modelcontextprotocol/server';

import { runToolWithErrorMapping } from '../../../../src/mcp/server/tool-results-utils/run-tool-with-error-mapping.ts';
import { BuildJobNotFoundError } from '../../../../src/services/builds/build-job-not-found-error.ts';
import { BuildQueueFullError } from '../../../../src/services/builds/build-queue-full-error.ts';
import { DockerApiError } from '../../../../src/services/docker/docker-api-error.ts';
import { DockerConnectionError } from '../../../../src/services/docker/docker-connection-error.ts';
import { ImageNotManagedError } from '../../../../src/services/docker/image-not-managed-error.ts';
import { ImagePullError } from '../../../../src/services/docker/image-pull-error.ts';
import { ValidationError } from '../../../../src/services/validation/validation-error.ts';

test('a failing call answers an error result instead of throwing; a successful one passes through untouched', async () => {
    const answered: CallToolResult = { content: [{ type: 'text', text: 'fine' }] };

    const passedThrough: CallToolResult = await runToolWithErrorMapping(async () => answered);
    const failed: CallToolResult = await runToolWithErrorMapping(async () => {
        throw new Error('boom');
    });

    assert.equal(passedThrough, answered);
    assert.deepEqual(failed, { content: [{ type: 'text', text: 'Unexpected error: boom' }], isError: true });
});

test('a request parser\'s message is prefixed "Invalid arguments", so the model corrects the named field', async () => {
    assert.equal(await textOfFailure(new ValidationError('"name" must be a string')), 'Invalid arguments: "name" must be a string');
});

test('an unmanaged image is explained in the tool\'s own words, not the delete endpoint\'s', async () => {
    assert.equal(
        await textOfFailure(new ImageNotManagedError('nginx:1.27')),
        'Image "nginx:1.27" was not built by this platform, so this tool cannot act on it. Only the images list_images reports are available.',
    );
});

test('the daemon\'s 404 is "Not found"; any other refusal carries its status and the daemon\'s words', async () => {
    assert.equal(
        await textOfFailure(new DockerApiError('No such container: web', 404, 'GET /containers/web/json')),
        'Not found: No such container: web',
    );
    assert.equal(
        await textOfFailure(new DockerApiError('conflict: unable to remove repository reference', 409, 'DELETE /images/abc')),
        'The Docker daemon refused the request (HTTP 409): conflict: unable to remove repository reference',
    );
});

test('an unreachable daemon, a full queue, an unknown job and a failed pull keep their own messages', async () => {
    assert.match(
        await textOfFailure(new DockerConnectionError('http://127.0.0.1:2375', new Error('ECONNREFUSED'))),
        /^The Docker daemon is unreachable: Cannot reach the Docker daemon at http:\/\/127\.0\.0\.1:2375\./,
    );
    assert.equal(
        await textOfFailure(new BuildQueueFullError(10)),
        'The build queue is full (10 waiting jobs); try again after one finishes',
    );
    assert.equal(
        await textOfFailure(new BuildJobNotFoundError('job-7')),
        'Not found: No build job "job-7" — it may have expired or the server restarted',
    );
    assert.equal(
        await textOfFailure(new ImagePullError('nginx:nope', 'manifest unknown')),
        'Cannot pull image "nginx:nope": manifest unknown',
    );
});

test('anything else is "Unexpected error" with its message; a thrown non-Error is rendered as text', async () => {
    assert.equal(await textOfFailure(new RangeError('out of range')), 'Unexpected error: out of range');
    assert.equal(await textOfFailure('just a string'), 'Unexpected error: just a string');
});

/** The text of the error result a thrown `error` becomes; fails when the result is not an error. */
async function textOfFailure(error: unknown): Promise<string> {
    const result: CallToolResult = await runToolWithErrorMapping(async () => {
        throw error;
    });
    assert.equal(result.isError, true);
    const block = result.content[0];
    if (block === undefined || block.type !== 'text') {
        throw new Error('expected one text block');
    }
    return block.text;
}
