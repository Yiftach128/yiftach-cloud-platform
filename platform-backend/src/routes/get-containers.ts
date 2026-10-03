import { Router } from 'express';

import type { ContainerService } from '../services/docker/interfaces.ts';

/** GET /containers — the live container list, straight from the Docker daemon. */
export function getContainersRoute(docker: ContainerService): Router {
    return Router().get('/containers', async (_req, res) => {
        res.json(await docker.getContainers());
    });
}
