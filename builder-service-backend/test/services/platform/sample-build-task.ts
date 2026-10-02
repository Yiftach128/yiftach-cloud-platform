import type { BuildTask } from '../../../src/services/platform/interfaces.ts';

/**
 * A sample claimed task in the platform's own shape, for tests that need a
 * whole task and care about a few fields: a fresh object every call, fields
 * overridden by name. Data, not a fake — nothing here behaves.
 */

export const SAMPLE_JOB_ID: string = 'job-1';
export const SAMPLE_GIT_URL: string = 'https://github.com/acme/web.git';
export const SAMPLE_IMAGE_TAG: string = 'cloudplatform/build-acme-web:1a2b3c4d';

/** A build of the default branch whose container publishes one port and carries one variable. */
export function sampleBuildTask(overrides: Partial<BuildTask> = {}): BuildTask {
    const base: BuildTask = {
        jobId: SAMPLE_JOB_ID,
        gitUrl: SAMPLE_GIT_URL,
        imageTag: SAMPLE_IMAGE_TAG,
        container: {
            name: 'web',
            ports: [{ hostPort: 8080, containerPort: 80 }],
            env: { MODE: 'production' },
        },
    };
    return { ...base, ...overrides };
}
