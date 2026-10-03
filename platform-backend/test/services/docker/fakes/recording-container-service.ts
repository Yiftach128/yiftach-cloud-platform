import type {
    Container,
    ContainerDetails,
    ContainerLogs,
    ContainerService,
    ContainerStatsMap,
    CreateContainerOptions,
    DeleteContainerOptions,
    GetContainerLogsOptions,
    GetContainersOptions,
    RestartContainerOptions,
    StopContainerOptions,
} from '../../../../src/services/docker/interfaces.ts';
import type { RecordedServiceCall } from './interfaces.ts';

/**
 * The tests' `ContainerService`: answers each method with what the test set
 * on it — the same list, details or logs whatever id is asked for — keeps
 * every call with its arguments as passed, and throws the error a test hands
 * `failWith` for a method, as the daemon's refusal would arrive. It knows no
 * rule of the real service: a 409 for a running container is injected, never
 * derived.
 */
export class RecordingContainerService implements ContainerService {
    readonly baseUrl: string = 'http://docker.test:2375';
    /** Every call made, in order, with the arguments as passed. */
    readonly calls: RecordedServiceCall[] = [];
    /** What `getContainers` answers. */
    containers: Container[] = [];
    /** What `getContainersStats` answers. */
    stats: ContainerStatsMap = {};
    /** What `getContainerById` and `createContainer` answer; a test that needs them sets it. */
    details: ContainerDetails | undefined = undefined;
    /** What `getContainerLogs` answers. */
    logs: ContainerLogs = { tty: false, lines: [] };
    private readonly failures: Map<string, Error> = new Map();

    failWith(method: keyof ContainerService, failure: Error): void {
        this.failures.set(method, failure);
    }

    async getContainers(options?: GetContainersOptions): Promise<Container[]> {
        this.recordCall('getContainers', [options]);
        return this.containers;
    }

    async getContainersStats(): Promise<ContainerStatsMap> {
        this.recordCall('getContainersStats', []);
        return this.stats;
    }

    async getContainerById(id: string): Promise<ContainerDetails> {
        this.recordCall('getContainerById', [id]);
        return this.detailsOrFail();
    }

    async createContainer(options: CreateContainerOptions): Promise<ContainerDetails> {
        this.recordCall('createContainer', [options]);
        return this.detailsOrFail();
    }

    async deleteContainer(id: string, options?: DeleteContainerOptions): Promise<void> {
        this.recordCall('deleteContainer', [id, options]);
    }

    async startContainer(id: string): Promise<void> {
        this.recordCall('startContainer', [id]);
    }

    async stopContainer(id: string, options?: StopContainerOptions): Promise<void> {
        this.recordCall('stopContainer', [id, options]);
    }

    async restartContainer(id: string, options?: RestartContainerOptions): Promise<void> {
        this.recordCall('restartContainer', [id, options]);
    }

    async getContainerLogs(id: string, options?: GetContainerLogsOptions): Promise<ContainerLogs> {
        this.recordCall('getContainerLogs', [id, options]);
        return this.logs;
    }

    /** Keeps the call, then throws the method's injected failure when there is one. */
    private recordCall(method: keyof ContainerService, callArguments: unknown[]): void {
        this.calls.push({ method: method, arguments: callArguments });
        const failure: Error | undefined = this.failures.get(method);
        if (failure !== undefined) {
            throw failure;
        }
    }

    private detailsOrFail(): ContainerDetails {
        if (this.details === undefined) {
            throw new Error('RecordingContainerService: no details set');
        }
        return this.details;
    }
}
