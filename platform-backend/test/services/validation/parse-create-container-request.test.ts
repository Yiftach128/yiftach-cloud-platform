/**
 * The POST /containers body: the body shape, the light image-reference check,
 * and that the container fields are held to the shared field rules. Pure
 * function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCreateContainerRequest } from '../../../src/services/validation/parse-create-container-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('a valid body is shaped into the create options, the image trimmed', () => {
    const options = parseCreateContainerRequest({
        name: 'web',
        image: ' nginx:1.27 ',
        ports: [{ hostPort: 8080, containerPort: 80 }],
        env: { MODE: 'prod' },
    });

    assert.deepEqual(options, {
        name: 'web',
        image: 'nginx:1.27',
        ports: [{ hostPort: 8080, containerPort: 80 }],
        env: { MODE: 'prod' },
    });
});

test('a body that is not a JSON object is refused', () => {
    assertRefused(() => parseCreateContainerRequest(null), 'Request body must be a JSON object');
    assertRefused(() => parseCreateContainerRequest([]), 'Request body must be a JSON object');
    assertRefused(() => parseCreateContainerRequest('nginx'), 'Request body must be a JSON object');
});

test('an image that is missing, not a string, or blank is refused', () => {
    assertRefused(() => parseCreateContainerRequest({ name: 'web' }), '"image" must be a string');
    assertRefused(() => parseCreateContainerRequest({ name: 'web', image: 7 }), '"image" must be a string');
    assertRefused(() => parseCreateContainerRequest({ name: 'web', image: '   ' }), '"image" must not be empty');
});

test('an image reference holds at most 256 characters', () => {
    assertRefused(
        () => parseCreateContainerRequest({ name: 'web', image: 'a'.repeat(257) }),
        '"image" must be at most 256 characters',
    );
});

test('an image reference with inner whitespace or a control character is refused', () => {
    assertRefused(
        () => parseCreateContainerRequest({ name: 'web', image: 'nginx latest' }),
        '"image" must not contain whitespace or control characters',
    );
    assertRefused(
        () => parseCreateContainerRequest({ name: 'web', image: 'nginx\u0000' }),
        '"image" must not contain whitespace or control characters',
    );
});

test('the name, ports and env are held to the shared container field rules', () => {
    assert.throws(
        () => parseCreateContainerRequest({ name: '-web', image: 'nginx' }),
        { name: 'ValidationError', message: /^"name" must be/ },
    );
    assert.throws(
        () => parseCreateContainerRequest({ name: 'web', image: 'nginx', ports: 8080 }),
        { name: 'ValidationError', message: /^"ports" must be/ },
    );
    assert.throws(
        () => parseCreateContainerRequest({ name: 'web', image: 'nginx', env: 'MODE=prod' }),
        { name: 'ValidationError', message: /^"env" must be/ },
    );
});

function assertRefused(parse: () => unknown, message: string): void {
    assert.throws(parse, new ValidationError(message));
}
