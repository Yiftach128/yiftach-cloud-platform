import { resolve } from 'node:path';

import express, { Router } from 'express';

/**
 * Paths that belong to the backend. The SPA fallback never answers them, so an
 * unknown API path stays a 404 instead of becoming index.html with a 200 — API
 * clients (the builder's axios) would read that HTML as success.
 */
const BACKEND_PATH_PREFIXES: string[] = ['/api', '/health'];

/**
 * Serves the built frontend (Vite's `dist` folder) from the API's own origin, so one
 * container carries both the UI and the API. Real files are served as-is; any other
 * GET gets index.html, because the frontend routes client-side (a reload of
 * /services/foo must still load the app). An empty `staticDir` serves nothing — local
 * dev, where the Vite dev server owns the UI.
 */
export function staticFrontend(staticDir: string): Router {
    const router: Router = Router();
    if (staticDir === '') {
        return router;
    }
    // sendFile refuses relative roots; a relative STATIC_DIR resolves against the launch directory.
    const root: string = resolve(staticDir);
    router.use(express.static(root));
    router.get('/{*splat}', (req, res, next) => {
        if (isBackendPath(req.path)) {
            next();
            return;
        }
        res.sendFile('index.html', { root: root });
    });
    return router;
}

function isBackendPath(path: string): boolean {
    for (const prefix of BACKEND_PATH_PREFIXES) {
        if (path === prefix || path.startsWith(`${prefix}/`)) {
            return true;
        }
    }
    return false;
}
