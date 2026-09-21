/**
 * Small formatting helpers shared by the tool files. Tool results are read by a
 * language model, so ids are shortened and byte counts arrive pre-divided —
 * small models are unreliable at both 64-character ids and arithmetic.
 */

const SHORT_ID_LENGTH = 12;
const BYTES_PER_MEBIBYTE = 1024 * 1024;

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
