/**
 * The builders' presence map: a heartbeat upserts by name, offline is derived
 * from the heartbeat's age at list time, a long-silent agent is forgotten,
 * and the list is sorted by name. Nothing faked; the clock is the runner's.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import { BuildAgentRegistry } from '../../../src/services/build-agents/build-agent-registry.ts';
import type { BuildAgent } from '../../../src/services/build-agents/interfaces.ts';

const NOW: number = Date.parse('2026-10-01T10:00:00.000Z');
const STARTED_AT: Date = new Date('2026-10-01T09:00:00.000Z');
const SECOND_MS: number = 1_000;
const MINUTE_MS: number = 60 * SECOND_MS;

test('a heartbeat under a known name replaces the row rather than adding one', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
    const registry: BuildAgentRegistry = new BuildAgentRegistry();
    registry.recordHeartbeat({ name: 'builder-1', status: 'idle', startedAt: STARTED_AT });
    const restartedAt: Date = new Date('2026-10-01T09:30:00.000Z');

    t.mock.timers.tick(5 * SECOND_MS);
    registry.recordHeartbeat({ name: 'builder-1', status: 'building', currentJobId: 'job-7', startedAt: restartedAt });

    assert.deepEqual(registry.listAgents(), [{
        name: 'builder-1',
        status: 'building',
        startedAt: restartedAt,
        lastSeenAt: new Date(NOW + 5 * SECOND_MS),
        currentJobId: 'job-7',
    }]);
});

test('an agent silent for more than 30 seconds lists as offline and loses its job id', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
    const registry: BuildAgentRegistry = new BuildAgentRegistry();
    registry.recordHeartbeat({ name: 'builder-1', status: 'building', currentJobId: 'job-7', startedAt: STARTED_AT });

    t.mock.timers.tick(30 * SECOND_MS);
    assert.deepEqual(registry.listAgents().map((agent: BuildAgent) => agent.status), ['building']);

    t.mock.timers.tick(1);
    assert.deepEqual(registry.listAgents(), [{
        name: 'builder-1',
        status: 'offline',
        startedAt: STARTED_AT,
        lastSeenAt: new Date(NOW),
    }]);
});

test('an agent silent for more than 30 minutes is forgotten', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
    const registry: BuildAgentRegistry = new BuildAgentRegistry();
    registry.recordHeartbeat({ name: 'builder-1', status: 'idle', startedAt: STARTED_AT });

    t.mock.timers.tick(30 * MINUTE_MS);
    assert.deepEqual(registry.listAgents().map((agent: BuildAgent) => agent.status), ['offline']);

    t.mock.timers.tick(1);
    assert.deepEqual(registry.listAgents(), []);
});

test('agents are listed by name', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
    const registry: BuildAgentRegistry = new BuildAgentRegistry();
    registry.recordHeartbeat({ name: 'zeta', status: 'idle', startedAt: STARTED_AT });
    registry.recordHeartbeat({ name: 'alpha', status: 'idle', startedAt: STARTED_AT });
    registry.recordHeartbeat({ name: 'mid', status: 'idle', startedAt: STARTED_AT });

    assert.deepEqual(registry.listAgents().map((agent: BuildAgent) => agent.name), ['alpha', 'mid', 'zeta']);
});
