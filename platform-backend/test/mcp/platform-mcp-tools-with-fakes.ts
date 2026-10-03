import type { TestContext } from 'node:test';

import { connectInProcessMcpToolProvider } from '../../src/mcp/client/connect-in-process-mcp-tool-provider.ts';
import type { McpToolProvider } from '../../src/mcp/client/mcp-tool-provider.ts';
import type { ToolCallOutcome } from '../../src/services/ai-agent/interfaces.ts';
import { BuildAgentRegistry } from '../../src/services/build-agents/build-agent-registry.ts';
import { BuildJobRegistry } from '../../src/services/builds/build-job-registry.ts';
import { BuildQueueService } from '../../src/services/builds/build-queue-service.ts';
import { RecordingContainerService } from '../services/docker/fakes/recording-container-service.ts';
import { RecordingDockerDaemonLifecycle } from '../services/docker/fakes/recording-docker-daemon-lifecycle.ts';
import { RecordingImageService } from '../services/docker/fakes/recording-image-service.ts';

/** Never reached: no test starts the queue's sweep. */
const BUILD_STALE_TIMEOUT_MS: number = 10 * 60_000;

/**
 * The platform's MCP tools linked to an in-process MCP client, as `server.ts`
 * links them, over the two docker fakes and the real in-memory build queue
 * and agent registry. `call` answers exactly what the agent's model reads;
 * `callJson` parses one JSON result. The link is closed when the test ends.
 */
export class PlatformMcpToolsWithFakes {
    readonly docker: RecordingContainerService;
    readonly images: RecordingImageService;
    readonly builds: BuildQueueService;
    readonly buildAgents: BuildAgentRegistry;
    readonly provider: McpToolProvider;

    private constructor(
        docker: RecordingContainerService,
        images: RecordingImageService,
        builds: BuildQueueService,
        buildAgents: BuildAgentRegistry,
        provider: McpToolProvider,
    ) {
        this.docker = docker;
        this.images = images;
        this.builds = builds;
        this.buildAgents = buildAgents;
        this.provider = provider;
    }

    static async connect(t: TestContext): Promise<PlatformMcpToolsWithFakes> {
        const docker: RecordingContainerService = new RecordingContainerService();
        const images: RecordingImageService = new RecordingImageService();
        const builds: BuildQueueService = new BuildQueueService(
            new BuildJobRegistry(),
            new RecordingDockerDaemonLifecycle(),
            BUILD_STALE_TIMEOUT_MS,
        );
        const buildAgents: BuildAgentRegistry = new BuildAgentRegistry();
        const provider: McpToolProvider = await connectInProcessMcpToolProvider({
            docker: docker,
            images: images,
            builds: builds,
            buildAgents: buildAgents,
        });
        t.after((): Promise<void> => provider.close());
        return new PlatformMcpToolsWithFakes(docker, images, builds, buildAgents, provider);
    }

    /** One tool call, answered as the model reads it: the text and whether it is an error. */
    call(name: string, toolArguments: Record<string, unknown>): Promise<ToolCallOutcome> {
        return this.provider.callTool(name, toolArguments, new AbortController().signal);
    }

    /** One tool call whose answer is JSON, parsed; fails the test on an error result. */
    async callJson<T>(name: string, toolArguments: Record<string, unknown>): Promise<T> {
        const outcome: ToolCallOutcome = await this.call(name, toolArguments);
        if (outcome.isError) {
            throw new Error(`${name} answered an error: ${outcome.text}`);
        }
        return JSON.parse(outcome.text) as T;
    }
}
