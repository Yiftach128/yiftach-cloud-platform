import type { DockerDaemonLifecycle } from '../../../../src/services/docker/interfaces.ts';

/**
 * The tests' `DockerDaemonLifecycle`: counts how often it was asked to bring
 * the daemon up (the ask carries no arguments, so the count is the record),
 * and rejects every ask after `failWith`, as a distro that will not boot would.
 */
export class RecordingDockerDaemonLifecycle implements DockerDaemonLifecycle {
    ensureRunningCalls: number = 0;
    private failure: Error | undefined = undefined;

    failWith(failure: Error): void {
        this.failure = failure;
    }

    async ensureRunning(): Promise<void> {
        this.ensureRunningCalls = this.ensureRunningCalls + 1;
        if (this.failure !== undefined) {
            throw this.failure;
        }
    }
}
