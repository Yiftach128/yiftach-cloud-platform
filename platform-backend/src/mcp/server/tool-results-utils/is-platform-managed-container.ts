import type { Container } from '../../../services/docker/interfaces.ts';

/** The label the platform stamps on every container it creates (`DockerManagerService.createContainer`). */
const MANAGED_LABEL = 'cloudplatform.managed';

/**
 * Whether the platform created this container. The list and stats tools show
 * the platform's own containers unless asked for every container on the
 * machine, so both decide "own" here — by the same label the services table's
 * managed-only switch reads.
 */
export function isPlatformManagedContainer(container: Container): boolean {
    return container.labels[MANAGED_LABEL] === 'true';
}
