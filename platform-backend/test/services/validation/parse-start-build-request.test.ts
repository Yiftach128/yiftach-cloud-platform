/**
 * The POST /builds body: the GitHub repository URL grammar and what is parsed
 * out of it, the optional image name, and that the container fields are held
 * to the shared field rules. Pure function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseStartBuildRequest } from '../../../src/services/validation/parse-start-build-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

const ROOT_URL_RULE: string =
    '"gitUrl" must be a repository root URL like https://github.com/owner/repository (not a /tree/... or file page)';
const IMAGE_NAME_RULE: string =
    '"imageName" must look like "name" or "name:tag" — lowercase name of letters, digits, ".", "_", "-"'
    + ' (optionally slash-separated), e.g. my-app or team/my-app:v2';

test('a repository URL is split into owner and repository, the ".git" suffix dropped and the "#fragment" the git ref', () => {
    const options = parseStartBuildRequest({
        gitUrl: ' https://github.com/Yiftach128/my-repo.git#release/1.0 ',
        name: 'web',
        ports: [{ hostPort: 8080, containerPort: 80 }],
        env: { MODE: 'prod' },
    });

    assert.deepEqual(options, {
        gitUrl: 'https://github.com/Yiftach128/my-repo.git#release/1.0',
        owner: 'Yiftach128',
        repo: 'my-repo',
        gitRef: 'release/1.0',
        container: { name: 'web', ports: [{ hostPort: 8080, containerPort: 80 }], env: { MODE: 'prod' } },
    });
});

test('without a "#fragment" or an image name the options carry neither; www.github.com is accepted', () => {
    const options = parseStartBuildRequest({ gitUrl: 'https://www.github.com/owner/repo', name: 'web' });

    assert.deepEqual(options, {
        gitUrl: 'https://www.github.com/owner/repo',
        owner: 'owner',
        repo: 'repo',
        container: { name: 'web', ports: [], env: {} },
    });
});

test('a given image name is kept trimmed; a blank one counts as absent', () => {
    const named = parseStartBuildRequest({ gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: ' team/my-app:v2 ' });
    assert.equal(named.imageName, 'team/my-app:v2');

    const blank = parseStartBuildRequest({ gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: '   ' });
    assert.equal(blank.imageName, undefined);
});

test('a gitUrl that is missing, blank or not a URL is refused', () => {
    assertRefused({ name: 'web' }, '"gitUrl" must be a non-empty string');
    assertRefused({ gitUrl: '  ', name: 'web' }, '"gitUrl" must be a non-empty string');
    assertRefused({ gitUrl: 'github.com/owner/repo', name: 'web' }, '"gitUrl" is not a valid URL');
});

test('a gitUrl must be https on github.com', () => {
    assertRefused({ gitUrl: 'http://github.com/owner/repo', name: 'web' }, '"gitUrl" must use https');
    assertRefused({ gitUrl: 'https://gitlab.com/owner/repo', name: 'web' }, '"gitUrl" must point at github.com');
});

test('a gitUrl with credentials or a query string is refused', () => {
    assertRefused({ gitUrl: 'https://user:token@github.com/owner/repo', name: 'web' }, '"gitUrl" must not contain credentials');
    assertRefused({ gitUrl: 'https://github.com/owner/repo?ref=main', name: 'web' }, '"gitUrl" must not have a query string');
});

test('a gitUrl that is not a repository root is refused', () => {
    assertRefused({ gitUrl: 'https://github.com/owner/repo/tree/main', name: 'web' }, ROOT_URL_RULE);
    assertRefused({ gitUrl: 'https://github.com/owner', name: 'web' }, ROOT_URL_RULE);
});

test('an owner or repository outside letters, digits, "_", "." and "-" is refused', () => {
    assertRefused({ gitUrl: 'https://github.com/own er/repo', name: 'web' }, '"gitUrl" has an invalid owner or repository name');
    assertRefused({ gitUrl: 'https://github.com/owner/.git', name: 'web' }, '"gitUrl" has an invalid owner or repository name');
});

test('a "#fragment" outside the git ref charset is refused', () => {
    assertRefused({ gitUrl: 'https://github.com/owner/repo#main^2', name: 'web' }, '"gitUrl" has an invalid #branch-or-tag fragment');
});

test('an image name that is not a string, longer than 200 characters, or not "name" or "name:tag" is refused', () => {
    assertRefused(
        { gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: 42 },
        '"imageName" must be a string when present',
    );
    assertRefused(
        { gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: 'a'.repeat(201) },
        '"imageName" must be at most 200 characters',
    );
    assertRefused({ gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: 'My-App' }, IMAGE_NAME_RULE);
    assertRefused({ gitUrl: 'https://github.com/owner/repo', name: 'web', imageName: 'my-app:' }, IMAGE_NAME_RULE);
});

test('the name, ports and env are held to the shared container field rules', () => {
    assert.throws(
        () => parseStartBuildRequest({ gitUrl: 'https://github.com/owner/repo', name: '-web' }),
        { name: 'ValidationError', message: /^"name" must be/ },
    );
    assert.throws(
        () => parseStartBuildRequest({ gitUrl: 'https://github.com/owner/repo', name: 'web', ports: 8080 }),
        { name: 'ValidationError', message: /^"ports" must be/ },
    );
    assert.throws(
        () => parseStartBuildRequest({ gitUrl: 'https://github.com/owner/repo', name: 'web', env: 'MODE=prod' }),
        { name: 'ValidationError', message: /^"env" must be/ },
    );
});

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseStartBuildRequest(body), new ValidationError(message));
}
