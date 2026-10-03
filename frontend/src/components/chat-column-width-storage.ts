import {
    readFromSessionStorageWithLocalStorageFallback,
    storeInSessionStorageAndLocalStorage,
} from './session-storage-with-local-storage-fallback.ts';

/* The width the user dragged the assistant column to — a preference, so it
   follows the session-then-local policy of
   session-storage-with-local-storage-fallback.ts: a reload keeps it, a drag
   in one tab never resizes another, and a new tab opens at the width last
   dragged anywhere. Without it every reload would snap the column back to
   its default and the drag would be pointless. Unreadable, absent or not a
   number means null, and the column falls back to its default width. */

const STORAGE_KEY: string = 'ycp.assistantColumnWidth';

/** The remembered width, or null when there is none or it is unreadable. */
export function readStoredChatColumnWidth(): number | null {
    const raw: string | null = readFromSessionStorageWithLocalStorageFallback(STORAGE_KEY);
    if (raw === null) {
        return null;
    }
    const parsed: number = Number(raw);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return parsed;
}

export function storeChatColumnWidth(width: number): void {
    storeInSessionStorageAndLocalStorage(STORAGE_KEY, String(width));
}
