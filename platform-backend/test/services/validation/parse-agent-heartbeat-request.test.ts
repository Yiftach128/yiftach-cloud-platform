/**
 * The POST /build-agents/heartbeat body: the agent's name, activity, current
 * job and start time, with the free-text fields cut to a sane length. Pure
 * function, nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAgentHeartbeatRequest } from '../../../src/services/validation/parse-agent-heartbeat-request.ts';
import { ValidationError } from '../../../src/services/validation/validation-error.ts';

test('a building agent reports its name, job and start time; an idle one carries no job id', () => {
    const building = parseAgentHeartbeatRequest({
        name: 'builder-1',
        status: 'building',
        currentJobId: 'job-7',
        startedAt: '2026-10-01T09:00:00.000Z',
    });
    assert.deepEqual(building, {
        name: 'builder-1',
        status: 'building',
        currentJobId: 'job-7',
        startedAt: new Date('2026-10-01T09:00:00.000Z'),
    });

    const idle = parseAgentHeartbeatRequest({ name: 'builder-1', status: 'idle', startedAt: '2026-10-01T09:00:00.000Z' });
    assert.deepEqual(idle, { name: 'builder-1', status: 'idle', startedAt: new Date('2026-10-01T09:00:00.000Z') });
});

test('the name is trimmed and cut to 200 characters, the job id to 100', () => {
    const report = parseAgentHeartbeatRequest({
        name: ` ${'n'.repeat(250)} `,
        status: 'building',
        currentJobId: 'j'.repeat(150),
        startedAt: '2026-10-01T09:00:00.000Z',
    });

    assert.equal(report.name, 'n'.repeat(200));
    assert.equal(report.currentJobId, 'j'.repeat(100));
});

test('a missing or blank name is refused', () => {
    assertRefused({ status: 'idle', startedAt: '2026-10-01T09:00:00.000Z' }, '"name" must be a non-empty string');
    assertRefused({ name: '  ', status: 'idle', startedAt: '2026-10-01T09:00:00.000Z' }, '"name" must be a non-empty string');
});

test('a status other than "idle" or "building" is refused', () => {
    assertRefused(
        { name: 'builder-1', status: 'offline', startedAt: '2026-10-01T09:00:00.000Z' },
        '"status" must be "idle" or "building"',
    );
});

test('a job id that is not a string is refused', () => {
    assertRefused(
        { name: 'builder-1', status: 'building', currentJobId: 7, startedAt: '2026-10-01T09:00:00.000Z' },
        '"currentJobId" must be a string when present',
    );
});

test('a start time that is missing or not a timestamp is refused', () => {
    assertRefused({ name: 'builder-1', status: 'idle' }, '"startedAt" must be an ISO 8601 timestamp string');
    assertRefused(
        { name: 'builder-1', status: 'idle', startedAt: 'yesterday' },
        '"startedAt" must be a valid ISO 8601 timestamp',
    );
});

function assertRefused(body: unknown, message: string): void {
    assert.throws(() => parseAgentHeartbeatRequest(body), new ValidationError(message));
}
