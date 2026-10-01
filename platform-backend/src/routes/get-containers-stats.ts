import { Router } from 'express';

import type { ContainerService } from '../services/docker/interfaces.ts';

/** GET /containers/stats — one live resource-usage sample per running container, keyed by container id. */
export function getContainersStatsRoute(docker: ContainerService): Router {
    return Router().get('/containers/stats', async (_req, res) => {
        res.json(await docker.getContainersStats());
    });
}
