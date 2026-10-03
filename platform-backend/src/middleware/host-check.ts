import type { RequestHandler } from 'express';

/**
 * Rejects (403) any request that does not come from an allowed host. The API has
 * no login and controls Docker, so binding to loopback is the only thing keeping
 * strangers out — and a browser on this machine is a way around that. Two headers
 * close the two browser routes:
 *
 * - `Host` — DNS rebinding: a foreign page re-points its own domain at 127.0.0.1,
 *   which makes its requests same-origin to the browser (so it can read responses
 *   and send JSON bodies). The Host header still names the foreign domain.
 * - `Origin` — a foreign page firing a body-less POST (stop/restart) straight at
 *   localhost. No CORS preflight guards that, and the Host header is the allowed
 *   one. Browsers send Origin on every cross-origin request and on every
 *   POST/DELETE; non-browser clients (the builder, the healthcheck) send none, so
 *   a missing Origin passes.
 *
 * `allowedHosts` is a comma-separated hostname list (`ALLOWED_HOSTS`); ports are
 * ignored, so one entry covers the API port, the Vite dev port, and a moved
 * compose port.
 */
export function hostCheck(allowedHosts: string): RequestHandler {
    const allowed: string[] = parseAllowedHosts(allowedHosts);
    return (req, res, next) => {
        const host: string = hostHeaderHostname(req.headers.host);
        if (!allowed.includes(host)) {
            res.status(403).json({ message: `Host "${host}" is not allowed` });
            return;
        }
        const origin: string | undefined = req.headers.origin;
        if (origin !== undefined && !allowed.includes(originHostname(origin))) {
            res.status(403).json({ message: `Origin "${origin}" is not allowed` });
            return;
        }
        next();
    };
}

function parseAllowedHosts(allowedHosts: string): string[] {
    return allowedHosts
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry !== '');
}

/**
 * The hostname of a Host header value ("localhost:3080" → "localhost"); an IPv6
 * literal keeps its brackets ("[::1]:3000" → "[::1]"). Read from the raw header on
 * purpose — `req.hostname` would follow X-Forwarded-Host once `trust proxy` is on,
 * and a rebinding page can forge that header.
 */
function hostHeaderHostname(hostHeader: string | undefined): string {
    if (hostHeader === undefined) {
        return '';
    }
    const host: string = hostHeader.trim().toLowerCase();
    let portSearchStart: number;
    if (host.startsWith('[')) {
        portSearchStart = host.indexOf(']') + 1;
    } else {
        portSearchStart = 0;
    }
    const colon: number = host.indexOf(':', portSearchStart);
    if (colon === -1) {
        return host;
    }
    return host.substring(0, colon);
}

/** The hostname of an Origin header value; "" for anything unparsable (e.g. the literal "null"). */
function originHostname(origin: string): string {
    if (!URL.canParse(origin)) {
        return '';
    }
    return new URL(origin).hostname;
}
