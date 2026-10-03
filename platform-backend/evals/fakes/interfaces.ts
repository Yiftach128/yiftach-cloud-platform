/**
 * Types of the stand-ins the evals hand the agent (`fakes/`): what the canned
 * platform remembers within one case.
 */

/**
 * What the canned platform remembers for the rest of a case — one instance
 * per case, so every case still starts from the same platform. Only a stop is
 * remembered: a follow-up that stops a container and then deletes it needs
 * the delete to succeed the way it would on the daemon. The reads (list,
 * details, stats) keep showing the platform as it was.
 */
export interface CannedPlatformCaseMemory {
    /** Names of the containers `stop_container` stopped in this case. */
    stoppedContainerNames: Set<string>;
}
