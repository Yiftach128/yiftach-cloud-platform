import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

import type { BuildTask } from '../../../../src/services/platform/interfaces.ts';
import { BuildWorker } from '../../../../src/services/worker/build-worker.ts';
import { HeartbeatReporter } from '../../../../src/services/worker/heartbeat-reporter.ts';
import { PortResolver } from '../../../../src/services/worker/port-resolver.ts';
import { RecordingImageBuilderService } from '../../docker/fakes/recording-image-builder-service.ts';
import { RecordingRepositoryCloneService } from '../../git/fakes/recording-repository-clone-service.ts';
import { RecordingPlatformApiClient } from '../../platform/fakes/recording-platform-api-client.ts';

/**
 * The build worker built as `main.ts` builds it, with the three fakes in the
 * slots of the platform, git and Docker, and the worker folder's own port
 * resolver, heartbeat reporter and log batcher for real. One per test.
 *
 * The worker makes and deletes its clone workspaces on the disk itself, so
 * `start` gives it a temp folder of its own and registers the folder's
 * removal on the test; no test touches the disk. `start` also puts the clock
 * and the log batcher's flush timer under mock timers and silences the
 * worker's console lines.
 */
export class BuildWorkerWithFakes {
    static readonly AGENT_NAME: string = 'builder-under-test';
    /** The mocked clock at `start`; the heartbeats' `startedAt`. */
    static readonly STARTED_AT: string = '2026-10-02T10:00:00.000Z';
    static readonly GIT_CLONE_TIMEOUT_MS: number = 120_000;

    readonly platform: RecordingPlatformApiClient = new RecordingPlatformApiClient();
    readonly git: RecordingRepositoryCloneService = new RecordingRepositoryCloneService();
    readonly images: RecordingImageBuilderService = new RecordingImageBuilderService();
    /** The folder the worker makes its per-build workspaces under. */
    readonly workspaceDir: string;
    readonly worker: BuildWorker;

    private constructor(workspaceDir: string) {
        this.workspaceDir = workspaceDir;
        const portResolver: PortResolver = new PortResolver(this.platform);
        const heartbeats: HeartbeatReporter = new HeartbeatReporter(this.platform, {
            agentName: BuildWorkerWithFakes.AGENT_NAME,
            heartbeatIntervalMs: 10_000,
        });
        this.worker = new BuildWorker(this.platform, this.git, this.images, portResolver, heartbeats, {
            pollIntervalMs: 2_000,
            workspaceDir: workspaceDir,
            gitCloneTimeoutMs: BuildWorkerWithFakes.GIT_CLONE_TIMEOUT_MS,
        });
    }

    static async start(t: TestContext): Promise<BuildWorkerWithFakes> {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.parse(BuildWorkerWithFakes.STARTED_AT) });
        t.mock.method(console, 'log', () => {});
        t.mock.method(console, 'warn', () => {});
        const workspaceDir: string = await mkdtemp(join(tmpdir(), 'ycp-build-worker-'));
        t.after((): Promise<void> => rm(workspaceDir, { recursive: true, force: true }));
        return new BuildWorkerWithFakes(workspaceDir);
    }

    /**
     * Queues the task and runs the worker until it has finished it. The stop
     * is requested while the claim is still in flight, so the worker processes
     * exactly this task and returns without ever waiting for the next poll.
     */
    async runOneTask(task: BuildTask): Promise<void> {
        this.platform.tasks.push(task);
        const running: Promise<void> = this.worker.run();
        this.worker.requestStop();
        await running;
    }

    /** What is left under the workspace folder; empty once every clone workspace is deleted. */
    workspaceEntries(): Promise<string[]> {
        return readdir(this.workspaceDir);
    }
}
