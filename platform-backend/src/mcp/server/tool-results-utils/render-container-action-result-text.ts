import type { ContainerDetails } from '../../../services/docker/interfaces.ts';

/**
 * The one-line result of start_container, stop_container and restart_container:
 * what was done, and the state the container is in now. The state is inspected
 * after the action on purpose — a container that "started" and exited at once
 * is the case a model must not report as running.
 */
export function renderContainerActionResultText(action: string, details: ContainerDetails): string {
    let stateNow: string;
    if (details.state.status === 'exited') {
        stateNow = `exited (exit code ${details.state.exitCode})`;
    } else {
        stateNow = details.state.status;
    }
    return `Container "${details.name}" ${action}. State now: ${stateNow}.`;
}
