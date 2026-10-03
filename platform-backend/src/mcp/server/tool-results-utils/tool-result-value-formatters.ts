/**
 * Small formatting helpers shared by the tool files. Tool results are read by a
 * language model, so ids are shortened and byte counts arrive pre-divided —
 * small models are unreliable at both 64-character ids and arithmetic.
 */

import type { PortBinding } from '../../../services/docker/interfaces.ts';

const SHORT_ID_LENGTH = 12;
const BYTES_PER_MEBIBYTE = 1024 * 1024;
/** Host addresses that mean "every interface"; the daemon reports a port published that way once per address family. */
const WILDCARD_HOST_IPS: string[] = ['', '0.0.0.0', '::'];

/** Docker's familiar 12-character short container id. */
export function toShortContainerId(id: string): string {
    return id.substring(0, SHORT_ID_LENGTH);
}

/** Shortens "sha256:<64 hex>" to the 12-character short image id (the daemon resolves it as an id prefix). */
export function toShortImageId(id: string): string {
    const prefix: string = 'sha256:';
    let hex: string;
    if (id.startsWith(prefix)) {
        hex = id.substring(prefix.length);
    } else {
        hex = id;
    }
    return hex.substring(0, SHORT_ID_LENGTH);
}

/** Bytes as MiB, rounded to one decimal. */
export function toMebibytes(bytes: number): number {
    return Math.round((bytes / BYTES_PER_MEBIBYTE) * 10) / 10;
}

export function roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Port bindings as the `docker ps` strings a reader knows: "8080->80/tcp",
 * "127.0.0.1:3080->3000/tcp", "11434/tcp (not published)". A port published on
 * every interface arrives twice from the daemon — once for IPv4, once for
 * IPv6 — and both entries say the same thing, so they collapse into one.
 */
export function toPortSummaries(ports: PortBinding[]): string[] {
    const summaries: string[] = [];
    for (const port of ports) {
        const summary: string = toPortSummary(port);
        if (!summaries.includes(summary)) {
            summaries.push(summary);
        }
    }
    return summaries;
}

function toPortSummary(port: PortBinding): string {
    const containerSide: string = `${port.privatePort}/${port.type}`;
    if (port.publicPort === undefined) {
        return `${containerSide} (not published)`;
    }
    let hostAddress: string;
    if (port.ip === undefined || WILDCARD_HOST_IPS.includes(port.ip)) {
        hostAddress = '';
    } else {
        hostAddress = `${port.ip}:`;
    }
    return `${hostAddress}${port.publicPort}->${containerSide}`;
}
