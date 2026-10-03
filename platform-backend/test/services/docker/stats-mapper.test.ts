/**
 * One daemon stats sample becoming `ContainerStats`: the `docker stats`
 * arithmetic for CPU and memory, and the empty shell a container that just
 * stopped reports. Pure; nothing faked.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ContainerStats } from '../../../src/services/docker/interfaces.ts';
import { toContainerStats, type RawContainerStats } from '../../../src/services/docker/stats-mapper.ts';

test('a sample without memory usage is null: the container stopped between being listed and being sampled', () => {
    assert.equal(toContainerStats({ memory_stats: {} }), null);
    assert.equal(toContainerStats({}), null);
});

test("cpu percent is the docker stats formula: the container's share of the elapsed host cpu time, times online cpus, times 100", () => {
    const stats: ContainerStats = statsOf({
        cpu_stats: { cpu_usage: { total_usage: 400 }, system_cpu_usage: 10_000, online_cpus: 4 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 8_000 },
        memory_stats: { usage: 1 },
    });

    assert.equal(stats.cpuPercent, 60);
});

test('without online_cpus the core count is the per-cpu list length (cgroup v1); a sample with nothing elapsed reads as 0, not a division by zero', () => {
    const cgroupV1: ContainerStats = statsOf({
        cpu_stats: { cpu_usage: { total_usage: 400, percpu_usage: [1, 2] }, system_cpu_usage: 10_000 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 8_000 },
        memory_stats: { usage: 1 },
    });
    const nothingElapsed: ContainerStats = statsOf({
        cpu_stats: { cpu_usage: { total_usage: 400 }, system_cpu_usage: 10_000, online_cpus: 4 },
        precpu_stats: { cpu_usage: { total_usage: 400 }, system_cpu_usage: 10_000, online_cpus: 4 },
        memory_stats: { usage: 1 },
    });

    assert.equal(cgroupV1.cpuPercent, 30);
    assert.equal(nothingElapsed.cpuPercent, 0);
});

test('memory used is usage minus the reclaimable page cache (inactive_file under cgroup v2, total_inactive_file under v1), never negative', () => {
    const cgroupV2: ContainerStats = statsOf({ memory_stats: { usage: 1000, limit: 4000, stats: { inactive_file: 300 } } });
    const cgroupV1: ContainerStats = statsOf({ memory_stats: { usage: 1000, limit: 4000, stats: { total_inactive_file: 300 } } });
    const cacheAboveUsage: ContainerStats = statsOf({ memory_stats: { usage: 1000, limit: 4000, stats: { inactive_file: 5000 } } });

    assert.deepEqual(cgroupV2, { cpuPercent: 0, memoryUsedBytes: 700, memoryLimitBytes: 4000 });
    assert.equal(cgroupV1.memoryUsedBytes, 700);
    assert.equal(cacheAboveUsage.memoryUsedBytes, 1000);
});

/** The mapped sample; fails when the mapper found the sample unusable. */
function statsOf(raw: RawContainerStats): ContainerStats {
    const stats: ContainerStats | null = toContainerStats(raw);
    if (stats === null) {
        throw new Error('expected a usable sample');
    }
    return stats;
}
