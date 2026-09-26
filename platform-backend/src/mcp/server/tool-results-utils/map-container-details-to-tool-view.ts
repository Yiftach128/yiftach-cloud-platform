import type {
    ContainerDetails,
    ContainerHealth,
    ContainerHealthProbe,
    ContainerHostConfigDetails,
    ContainerMount,
    ContainerRestartPolicy,
    NetworkAttachment,
} from '../../../services/docker/interfaces.ts';
import type {
    ContainerToolDetails,
    ContainerToolHealthView,
    ContainerToolMountView,
    ContainerToolNetworkView,
    ContainerToolResourceLimits,
    ContainerToolStateView,
} from '../interfaces.ts';
import {
    roundToTwoDecimals,
    toMebibytes,
    toPortSummaries,
    toShortContainerId,
    toShortImageId,
} from './tool-result-value-formatters.ts';

/** A healthcheck's output can be a whole HTTP body; a model needs its first lines. */
const MAX_PROBE_OUTPUT_LENGTH = 300;
const NANO_CPUS_PER_CPU = 1_000_000_000;

/**
 * `ContainerDetails` → `ContainerToolDetails`, the diagnostic view a model
 * reads (the interface says what is dropped and why). Shared by get_container
 * and create_container, so a container looks the same whether it was inspected
 * or just created; the REST routes keep serving the full inspect view to the
 * platform's UI.
 */
export function mapContainerDetailsToToolView(details: ContainerDetails): ContainerToolDetails {
    return {
        id: toShortContainerId(details.id),
        name: details.name,
        image: details.image,
        imageId: toShortImageId(details.imageId),
        createdAt: details.createdAt,
        command: [details.path].concat(details.args).join(' '),
        workingDir: details.config.workingDir,
        user: details.config.user,
        state: toStateView(details),
        ports: toPortSummaries(details.ports),
        envNames: details.config.env.map(toEnvName),
        labels: details.config.labels,
        restartPolicy: toRestartPolicySummary(details.hostConfig.restartPolicy),
        networkMode: details.hostConfig.networkMode,
        privileged: details.hostConfig.privileged,
        mounts: details.mounts.map(toMountView),
        networks: details.networks.map(toNetworkView),
        limits: toResourceLimits(details.hostConfig),
    };
}

function toStateView(details: ContainerDetails): ContainerToolStateView {
    const view: ContainerToolStateView = {
        status: details.state.status,
        exitCode: details.state.exitCode,
        oomKilled: details.state.oomKilled,
        error: details.state.error,
        restartCount: details.restartCount,
    };
    if (details.state.startedAt !== undefined) {
        view.startedAt = details.state.startedAt;
    }
    if (details.state.finishedAt !== undefined) {
        view.finishedAt = details.state.finishedAt;
    }
    if (details.state.health !== undefined) {
        view.health = toHealthView(details.state.health);
    }
    return view;
}

function toHealthView(health: ContainerHealth): ContainerToolHealthView {
    const lastProbe: ContainerHealthProbe | undefined = health.log[health.log.length - 1];
    let lastProbeOutput: string;
    if (lastProbe === undefined) {
        lastProbeOutput = '';
    } else if (lastProbe.output.length > MAX_PROBE_OUTPUT_LENGTH) {
        lastProbeOutput = `${lastProbe.output.substring(0, MAX_PROBE_OUTPUT_LENGTH)}... [cut]`;
    } else {
        lastProbeOutput = lastProbe.output;
    }
    return {
        status: health.status,
        failingStreak: health.failingStreak,
        lastProbeOutput: lastProbeOutput,
    };
}

/** "KEY=value" → "KEY"; an entry without "=" is a bare name already. */
function toEnvName(entry: string): string {
    const separator: number = entry.indexOf('=');
    if (separator === -1) {
        return entry;
    }
    return entry.substring(0, separator);
}

/** The policy as `docker run --restart` takes it, e.g. "unless-stopped" or "on-failure:3". */
function toRestartPolicySummary(policy: ContainerRestartPolicy): string {
    if (policy.name === 'on-failure' && policy.maximumRetryCount > 0) {
        return `on-failure:${policy.maximumRetryCount}`;
    }
    return policy.name;
}

function toMountView(mount: ContainerMount): ContainerToolMountView {
    return {
        type: mount.type,
        source: mount.source,
        destination: mount.destination,
        readWrite: mount.readWrite,
    };
}

function toNetworkView(network: NetworkAttachment): ContainerToolNetworkView {
    return {
        name: network.name,
        ipAddress: network.ipAddress,
        aliases: network.aliases,
    };
}

/** Only the limits that are set: the daemon reports an unset one as 0, which a model would read as "no memory". */
function toResourceLimits(hostConfig: ContainerHostConfigDetails): ContainerToolResourceLimits {
    const limits: ContainerToolResourceLimits = {};
    if (hostConfig.memory > 0) {
        limits.memoryMiB = toMebibytes(hostConfig.memory);
    }
    if (hostConfig.nanoCpus > 0) {
        limits.cpus = roundToTwoDecimals(hostConfig.nanoCpus / NANO_CPUS_PER_CPU);
    }
    if (hostConfig.pidsLimit > 0) {
        limits.pidsLimit = hostConfig.pidsLimit;
    }
    return limits;
}
