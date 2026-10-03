/**
 * The container field rules shared by the create-container and start-build
 * bodies: the name charset, the port mappings and the environment variables.
 * Pure functions, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    parseContainerName,
    parseEnvVars,
    parsePortMappings,
} from '../../../src/services/validation/parse-container-fields.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

const NAME_RULE: string =
    '"name" must be 1-63 characters of letters, digits, "_", ".", or "-", starting with a letter or digit';
const HOST_PORT_RULE: string = '"hostPort" must be an integer between 1 and 65535';

test('a name of letters, digits, "_", "." and "-" is accepted as given', () => {
    assert.equal(parseContainerName('my-app_1.0'), 'my-app_1.0');
});

test('a name holds at most 63 characters', () => {
    assert.equal(parseContainerName('a'.repeat(63)), 'a'.repeat(63));
    assertRefused(() => parseContainerName('a'.repeat(64)), NAME_RULE);
});

test('a name that starts with punctuation, holds a space, or is not a string is refused', () => {
    assertRefused(() => parseContainerName('-app'), NAME_RULE);
    assertRefused(() => parseContainerName('my app'), NAME_RULE);
    assertRefused(() => parseContainerName(42), NAME_RULE);
});

test('absent ports mean no ports', () => {
    assert.deepEqual(parsePortMappings(undefined), []);
});

test('port mappings are kept in order as { hostPort, containerPort } pairs, other keys dropped', () => {
    const mappings = parsePortMappings([
        { hostPort: 8080, containerPort: 80 },
        { hostPort: 8443, containerPort: 443, protocol: 'udp' },
    ]);

    assert.deepEqual(mappings, [
        { hostPort: 8080, containerPort: 80 },
        { hostPort: 8443, containerPort: 443 },
    ]);
});

test('ports that are not an array of objects are refused', () => {
    assertRefused(
        () => parsePortMappings({ hostPort: 8080, containerPort: 80 }),
        '"ports" must be an array of { hostPort, containerPort } objects',
    );
    assertRefused(() => parsePortMappings([8080]), 'each entry in "ports" must be a { hostPort, containerPort } object');
});

test('a port outside 1-65535, or not an integer, is refused by its field name', () => {
    assertRefused(() => parsePortMappings([{ hostPort: 0, containerPort: 80 }]), HOST_PORT_RULE);
    assertRefused(() => parsePortMappings([{ hostPort: 80.5, containerPort: 80 }]), HOST_PORT_RULE);
    assertRefused(() => parsePortMappings([{ hostPort: '8080', containerPort: 80 }]), HOST_PORT_RULE);
    assertRefused(
        () => parsePortMappings([{ hostPort: 8080, containerPort: 65536 }]),
        '"containerPort" must be an integer between 1 and 65535',
    );
});

test('a host port listed twice is refused; a container port published twice is not', () => {
    assertRefused(
        () => parsePortMappings([{ hostPort: 8080, containerPort: 80 }, { hostPort: 8080, containerPort: 81 }]),
        '"ports" lists hostPort 8080 more than once',
    );
    assert.deepEqual(
        parsePortMappings([{ hostPort: 8080, containerPort: 80 }, { hostPort: 8081, containerPort: 80 }]),
        [{ hostPort: 8080, containerPort: 80 }, { hostPort: 8081, containerPort: 80 }],
    );
});

test('absent env means no variables', () => {
    assert.deepEqual(parseEnvVars(undefined), {});
});

test('env that is not an object of string values is refused', () => {
    assertRefused(() => parseEnvVars(['MODE=prod']), '"env" must be an object mapping variable names to string values');
    assertRefused(() => parseEnvVars({ PORT: 3000 }), '"env.PORT" must be a string');
});

test('env holds at most 100 variables', () => {
    const hundred: Record<string, string> = {};
    for (let index = 1; index <= 100; index++) {
        hundred[`VAR_${index}`] = 'x';
    }
    assert.deepEqual(parseEnvVars(hundred), hundred);

    const hundredAndOne: Record<string, string> = { ...hundred, VAR_101: 'x' };
    assertRefused(() => parseEnvVars(hundredAndOne), '"env" must have at most 100 entries');
});

test('a variable name must be letters, digits and "_", not starting with a digit', () => {
    assertRefused(
        () => parseEnvVars({ '1ST': 'x' }),
        '"env" contains an invalid variable name "1ST" (letters, digits and "_", not starting with a digit)',
    );
    assertRefused(
        () => parseEnvVars({ 'MY-VAR': 'x' }),
        '"env" contains an invalid variable name "MY-VAR" (letters, digits and "_", not starting with a digit)',
    );
});

test('a variable value with a control character is refused; any other text is kept verbatim', () => {
    assertRefused(() => parseEnvVars({ GREETING: 'hi\nthere' }), '"env.GREETING" must not contain control characters');
    assertRefused(() => parseEnvVars({ GREETING: 'hi\u007f' }), '"env.GREETING" must not contain control characters');
    assert.deepEqual(parseEnvVars({ GREETING: ' héllo, wörld = "ok" ' }), { GREETING: ' héllo, wörld = "ok" ' });
});

function assertRefused(parse: () => unknown, message: string): void {
    assert.throws(parse, new ValidationError(message));
}
