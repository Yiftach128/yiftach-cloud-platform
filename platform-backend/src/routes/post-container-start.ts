import { Router } from 'express';

import type { ContainerService } from '../services/docker/interfaces.ts';

/** POST /containers/:id/start — starts a container; 204 even when already running. */
export function postContainerStartRoute(docker: ContainerService): Router {
    return Router().post('/containers/:id/start', async (req, res) => {
        await docker.startContainer(req.params.id);
        res.status(204).end();
    });
}
