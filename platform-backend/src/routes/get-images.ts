import { Router } from 'express';

import type { ImageService } from '../services/docker/interfaces.ts';

/** GET /images — the platform-built images (labeled cloudplatform.managed=true). */
export function getImagesRoute(images: ImageService): Router {
    return Router().get('/images', async (_req, res) => {
        res.json(await images.getManagedImages());
    });
}
