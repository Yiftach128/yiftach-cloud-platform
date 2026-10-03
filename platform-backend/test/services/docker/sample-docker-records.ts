import type { Container, ContainerDetails } from '../../../src/services/docker/interfaces.ts';

/**
 * Sample records in the docker services' own shapes, for tests that need a
 * whole container and care about a few fields: a fresh object every call,
 * fields overridden by name, nested parts changed in place by the test.
 * Data, not a fake — nothing here behaves.
 */

/** 64 hex characters, as the daemon reports ids. */
export const SAMPLE_CONTAINER_ID: string = '0123456789abcdef'.repeat(4);
export const SAMPLE_CONTAINER_SHORT_ID: string = '0123456789ab';
export const SAMPLE_IMAGE_ID: string = `sha256:${'fedcba9876543210'.repeat(4)}`;
export const SAMPLE_IMAGE_SHORT_ID: string = 'fedcba987654';
export const SAMPLE_CREATED_AT: Date = new Date('2026-09-30T08:00:00.000Z');

/** A running, platform-managed container as the list endpoint reports it. */
export function sampleContainer(overrides: Partial<Container> = {}): Container {
    const base: Container = {
        id: SAMPLE_CONTAINER_ID,
        name: 'web',
        names: ['web'],
        image: 'nginx:1.27',
        imageId: SAMPLE_IMAGE_ID,
        command: 'nginx -g daemon off;',
        createdAt: SAMPLE_CREATED_AT,
        state: 'running',
        status: 'Up 2 hours',
        ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' }],
        labels: { 'cloudplatform.managed': 'true' },
        networks: ['bridge'],
    };
    return { ...base, ...overrides };
}

/** A running, platform-managed container as the inspect endpoint reports it: no limits, no healthcheck. */
export function sampleContainerDetails(overrides: Partial<ContainerDetails> = {}): ContainerDetails {
    const base: ContainerDetails = {
        id: SAMPLE_CONTAINER_ID,
        name: 'web',
        image: 'nginx:1.27',
        imageId: SAMPLE_IMAGE_ID,
        createdAt: SAMPLE_CREATED_AT,
        path: 'nginx',
        args: ['-g', 'daemon off;'],
        platform: 'linux',
        driver: 'overlay2',
        restartCount: 0,
        logPath: '/var/lib/docker/containers/web-json.log',
        execIds: [],
        state: {
            status: 'running',
            running: true,
            paused: false,
            restarting: false,
            oomKilled: false,
            dead: false,
            pid: 4242,
            exitCode: 0,
            error: '',
            startedAt: new Date('2026-09-30T08:00:01.000Z'),
        },
        config: {
            hostname: '0123456789ab',
            domainname: '',
            user: '',
            env: ['PATH=/usr/local/sbin:/usr/local/bin', 'NGINX_VERSION=1.27.0'],
            cmd: ['nginx', '-g', 'daemon off;'],
            entrypoint: ['/docker-entrypoint.sh'],
            workingDir: '/',
            exposedPorts: ['80/tcp'],
            tty: false,
            labels: { 'cloudplatform.managed': 'true' },
        },
        hostConfig: {
            networkMode: 'bridge',
            restartPolicy: { name: 'unless-stopped', maximumRetryCount: 0 },
            autoRemove: false,
            privileged: false,
            readonlyRootfs: false,
            publishAllPorts: false,
            binds: [],
            capAdd: [],
            capDrop: [],
            dns: [],
            extraHosts: [],
            securityOpt: [],
            logConfig: { type: 'json-file', driverOptions: {} },
            memory: 0,
            memorySwap: 0,
            memoryReservation: 0,
            nanoCpus: 0,
            cpuShares: 0,
            cpuPeriod: 0,
            cpuQuota: 0,
            cpusetCpus: '',
            shmSize: 67108864,
            pidsLimit: 0,
        },
        mounts: [{
            type: 'bind',
            source: '/srv/web',
            destination: '/usr/share/nginx/html',
            mode: 'ro',
            readWrite: false,
            propagation: 'rprivate',
        }],
        ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' }],
        networks: [{
            name: 'bridge',
            networkId: 'net-1',
            endpointId: 'endpoint-1',
            macAddress: '02:42:ac:11:00:02',
            ipAddress: '172.17.0.2',
            ipPrefixLength: 16,
            gateway: '172.17.0.1',
            ipv6Address: '',
            ipv6Gateway: '',
            aliases: [],
        }],
    };
    return { ...base, ...overrides };
}
