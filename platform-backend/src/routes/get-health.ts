import { Router } from 'express';

import type { ContainerService } from '../services/docker/interfaces.ts';

/** GET /health — liveness probe; reports which Docker endpoint the backend targets. */
export function getHealthRoute(docker: ContainerService): Router {
    return Router().get('/health', (_req, res) => {
        res.json({ status: 'ok', docker: docker.baseUrl });
    });
}
