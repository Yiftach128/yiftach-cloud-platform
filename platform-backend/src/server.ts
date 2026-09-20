/**
 * Backend entry point — composition root. Wires services, routes, and middleware
 * together; no logic lives here.
 */

import express from 'express';

import { config } from './config/config.ts';
import { McpHttpEndpoint } from './mcp/mcp-http-endpoint.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { hostCheck } from './middleware/host-check.ts';
import { staticFrontend } from './middleware/static-frontend.ts';
import { allMcpRoute } from './routes/all-mcp.ts';
import { deleteContainerRoute } from './routes/delete-container.ts';
import { deleteImageRoute } from './routes/delete-image.ts';
import { getBuildAgentsRoute } from './routes/get-build-agents.ts';
import { getBuildRoute } from './routes/get-build.ts';
import { getContainerLogsRoute } from './routes/get-container-logs.ts';
import { getContainerRoute } from './routes/get-container.ts';
import { getContainersStatsRoute } from './routes/get-containers-stats.ts';
import { getContainersRoute } from './routes/get-containers.ts';
import { getHealthRoute } from './routes/get-health.ts';
import { getImageExposedPortsRoute } from './routes/get-image-exposed-ports.ts';
import { getImagePresetsRoute } from './routes/get-image-presets.ts';
import { getImageRoute } from './routes/get-image.ts';
import { getImagesRoute } from './routes/get-images.ts';
import { postBuildAgentsHeartbeatRoute } from './routes/post-build-agents-heartbeat.ts';
import { postBuildRoute } from './routes/post-build.ts';
import { postBuildsQueueClaimRoute } from './routes/post-builds-queue-claim.ts';
import { postBuildsQueueLogsRoute } from './routes/post-builds-queue-logs.ts';
import { postBuildsQueueResultRoute } from './routes/post-builds-queue-result.ts';
import { postContainerRestartRoute } from './routes/post-container-restart.ts';
import { postContainerStartRoute } from './routes/post-container-start.ts';
import { postContainerStopRoute } from './routes/post-container-stop.ts';
import { postContainerRoute } from './routes/post-container.ts';
import { BuildAgentRegistry } from './services/build-agents/build-agent-registry.ts';
import { BuildJobRegistry } from './services/builds/build-job-registry.ts';
import { BuildQueueService } from './services/builds/build-queue-service.ts';
import { DockerImageService } from './services/docker/docker-image-service.ts';
import { DockerManagerService } from './services/docker/docker-manager-service.ts';
import { ExternalDockerDaemon } from './services/docker/external-docker-daemon.ts';
import { resolveDockerEndpoint } from './services/docker/resolve-docker-endpoint.ts';
import { ImagePresetService } from './services/images/image-preset-service.ts';
import { bootstrapWslDocker } from './services/wsl/bootstrap-wsl-docker.ts';
import type { WslDockerDaemon } from './services/wsl/wsl-docker-daemon.ts';

const endpoint = resolveDockerEndpoint({ dockerHost: config.DOCKER_HOST });
const wslKeepalive: boolean = config.DOCKER_WSL_KEEPALIVE !== '0';

// A unix:// endpoint means this process runs next to a daemon somebody else keeps
// up (a container with the socket mounted): no WSL distro to boot. A tcp://
// endpoint is the WSL deployment.
let daemon: WslDockerDaemon | ExternalDockerDaemon;
if (endpoint.socketPath !== undefined) {
    daemon = new ExternalDockerDaemon();
} else {
    daemon = bootstrapWslDocker(endpoint.baseUrl, wslKeepalive);
}

const dockerImages = new DockerImageService({
    daemon: daemon,
    socketPath: endpoint.socketPath,
    host: endpoint.host,
    port: endpoint.port,
});
const docker = new DockerManagerService({
    daemon: daemon,
    images: dockerImages,
    socketPath: endpoint.socketPath,
    host: endpoint.host,
    port: endpoint.port,
});
const imagePresets = new ImagePresetService();
const buildRegistry = new BuildJobRegistry();
const imageBuilds = new BuildQueueService(buildRegistry, daemon, config.BUILD_STALE_TIMEOUT_MS);
const buildAgents = new BuildAgentRegistry();
const mcp = new McpHttpEndpoint({ docker: docker, images: dockerImages, buildAgents: buildAgents });

const app = express();
app.use(hostCheck(config.ALLOWED_HOSTS)); // first: nothing answers a request from a foreign host or origin
app.use(express.json());
app.use(getHealthRoute(docker)); // liveness probe stays unversioned
app.use(allMcpRoute(mcp)); // unversioned too: MCP negotiates its own protocol revision
app.use('/api/v1', getContainersRoute(docker));
app.use('/api/v1', getContainersStatsRoute(docker)); // before :id — /containers/stats must not match :id
app.use('/api/v1', getContainerRoute(docker));
app.use('/api/v1', postContainerRoute(docker));
app.use('/api/v1', deleteContainerRoute(docker));
app.use('/api/v1', getContainerLogsRoute(docker));
app.use('/api/v1', postContainerStartRoute(docker));
app.use('/api/v1', postContainerStopRoute(docker));
app.use('/api/v1', postContainerRestartRoute(docker));
app.use('/api/v1', getImagePresetsRoute(imagePresets));
app.use('/api/v1', getImagesRoute(dockerImages));
app.use('/api/v1', getImageExposedPortsRoute(dockerImages)); // two segments — never captured by :id
app.use('/api/v1', getImageRoute(dockerImages)); // after presets: /images/presets must not match :id
app.use('/api/v1', deleteImageRoute(dockerImages));
app.use('/api/v1', postBuildRoute(imageBuilds));
app.use('/api/v1', getBuildRoute(imageBuilds));
app.use('/api/v1', postBuildsQueueClaimRoute(imageBuilds));
app.use('/api/v1', postBuildsQueueLogsRoute(imageBuilds));
app.use('/api/v1', postBuildsQueueResultRoute(imageBuilds));
app.use('/api/v1', getBuildAgentsRoute(buildAgents));
app.use('/api/v1', postBuildAgentsHeartbeatRoute(buildAgents));
app.use(staticFrontend(config.STATIC_DIR)); // the built UI, after the API; serves nothing when STATIC_DIR is empty
app.use(errorHandler);

const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`platform-backend listening on http://${config.HOST}:${config.PORT} -> docker at ${docker.baseUrl}`);
});
imageBuilds.start();

// SIGBREAK is Windows's Ctrl+Break — kept as a fallback stop key, because
// terminal/shim layers have been seen eating Ctrl+C while Ctrl+Break still
// arrives. The log line makes a received-but-hanging shutdown distinguishable
// from a signal that never arrived.
const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGBREAK'];
for (const signal of shutdownSignals) {
    process.on(signal, () => {
        console.log(`${signal} received, shutting down...`);
        imageBuilds.stop();
        void mcp.close(); // ends open MCP streams, which would otherwise hold server.close() up
        daemon.stop();
        server.close(() => process.exit(0));
        // Fallback if connections linger past close.
        setTimeout(() => process.exit(0), 3_000).unref();
    });
}
