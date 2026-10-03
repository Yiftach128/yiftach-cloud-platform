import type { BuildJob } from '../../../services/builds/interfaces.ts';
import type { BuildJobToolView } from '../interfaces.ts';

/** Progress lines a build result carries: enough to see what the builder is doing or where it failed. */
const MAX_RECENT_LOG_LINES = 30;

/**
 * `BuildJob` → `BuildJobToolView`: the job as the REST API serves it, with the
 * progress log cut to its newest lines. Shared by start_build and get_build so
 * a job reads the same when queued and when polled later.
 */
export function mapBuildJobToToolView(job: BuildJob): BuildJobToolView {
    const view: BuildJobToolView = {
        id: job.id,
        status: job.status,
        gitUrl: job.gitUrl,
        imageTag: job.imageTag,
        containerName: job.containerName,
        createdAt: job.createdAt,
        recentLogLines: job.logLines.slice(-MAX_RECENT_LOG_LINES),
    };
    if (job.finishedAt !== undefined) {
        view.finishedAt = job.finishedAt;
    }
    if (job.errorMessage !== undefined) {
        view.errorMessage = job.errorMessage;
    }
    return view;
}
