import type {
    AgentHeartbeatRequest,
    BuildResultReport,
    BuildTask,
    ContainerSummary,
    CreateContainerRequest,
    ImageExposedPort,
    PlatformApiClient,
} from '../../../../src/services/platform/interfaces.ts';
import type { RecordedServiceCall } from './interfaces.ts';

/**
 * The tests' `PlatformApiClient`: hands out the tasks the test queued, answers
 * the two lookups with what the test set on it, keeps every call with its
 * arguments as passed, and throws the error a test hands `failWith` for a
 * method until `clearFailure`. It knows no rule of the platform: a lost job is
 * an injected `BuildJobLostError`, never derived from a job id.
 */
export class RecordingPlatformApiClient implements PlatformApiClient {
    /** Every call made, in order, with the arguments as passed. */
    readonly calls: RecordedServiceCall[] = [];
    /** What `claimBuildTask` hands out, oldest first; empty answers "no task". */
    readonly tasks: BuildTask[] = [];
    /** What `getImageExposedPorts` answers. */
    exposedPorts: ImageExposedPort[] = [];
    /** What `getContainers` answers. */
    containers: ContainerSummary[] = [];
    private readonly failures: Map<string, Error> = new Map();

    failWith(method: keyof PlatformApiClient, failure: Error): void {
        this.failures.set(method, failure);
    }

    clearFailure(method: keyof PlatformApiClient): void {
        this.failures.delete(method);
    }

    /** The arguments of every call to one method, in order. */
    callsTo(method: keyof PlatformApiClient): unknown[][] {
        return this.calls
            .filter((call: RecordedServiceCall): boolean => call.method === method)
            .map((call: RecordedServiceCall): unknown[] => call.arguments);
    }

    async claimBuildTask(): Promise<BuildTask | null> {
        this.recordCall('claimBuildTask', []);
        const task: BuildTask | undefined = this.tasks.shift();
        if (task === undefined) {
            return null;
        }
        return task;
    }

    async sendAgentHeartbeat(heartbeat: AgentHeartbeatRequest): Promise<void> {
        this.recordCall('sendAgentHeartbeat', [heartbeat]);
    }

    async appendBuildLogs(jobId: string, lines: string[]): Promise<void> {
        this.recordCall('appendBuildLogs', [jobId, lines]);
    }

    async reportBuildResult(jobId: string, result: BuildResultReport): Promise<void> {
        this.recordCall('reportBuildResult', [jobId, result]);
    }

    async createContainer(request: CreateContainerRequest): Promise<void> {
        this.recordCall('createContainer', [request]);
    }

    async getImageExposedPorts(reference: string): Promise<ImageExposedPort[]> {
        this.recordCall('getImageExposedPorts', [reference]);
        return this.exposedPorts;
    }

    async getContainers(): Promise<ContainerSummary[]> {
        this.recordCall('getContainers', []);
        return this.containers;
    }

    /** Keeps the call, then throws the method's injected failure when there is one. */
    private recordCall(method: keyof PlatformApiClient, callArguments: unknown[]): void {
        this.calls.push({ method: method, arguments: callArguments });
        const failure: Error | undefined = this.failures.get(method);
        if (failure !== undefined) {
            throw failure;
        }
    }
}
