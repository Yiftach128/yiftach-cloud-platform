/**
 * Lifecycle for a daemon somebody else keeps running — the unix socket deployment,
 * where this process is a container on the very daemon it talks to, so there is
 * nothing to boot and nothing to hold open. Exists so the composition root can hand
 * every consumer a `DockerDaemonLifecycle` whatever the endpoint kind; the WSL
 * counterpart lives in `src/services/wsl/`.
 */

import type { DockerDaemonLifecycle } from './interfaces.ts';

export class ExternalDockerDaemon implements DockerDaemonLifecycle {
    /** Resolves at once: a dead daemon is not ours to revive, so the retry just runs again. */
    ensureRunning(): Promise<void> {
        return Promise.resolve();
    }

    /** Nothing is held, so nothing to release; mirrors `WslDockerDaemon.stop()` for the shutdown path. */
    stop(): void {
        return;
    }
}
