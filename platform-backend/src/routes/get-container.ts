import { Router } from 'express';

import type { ContainerService } from '../services/docker/interfaces.ts';

/** GET /containers/:id — full inspect-level detail for one container. */
export function getContainerRoute(docker: ContainerService): Router {
    return Router().get('/containers/:id', async (req, res) => {
        res.json(await docker.getContainerById(req.params.id));
    });
}
