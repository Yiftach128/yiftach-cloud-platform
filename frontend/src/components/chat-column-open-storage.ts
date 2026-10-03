import {
    readFromSessionStorageWithLocalStorageFallback,
    storeInSessionStorageAndLocalStorage,
} from './session-storage-with-local-storage-fallback.ts';

/* Whether the assistant column is open — a preference, so it follows the
   session-then-local policy of session-storage-with-local-storage-fallback.ts:
   a reload brings the column back as it was, two tabs never flip each other,
   and a new tab starts as the last tab left it. Unreadable or absent means
   the default, closed. */

const STORAGE_KEY: string = 'ycp.assistantColumnOpen';

/** The remembered state, or false when there is none or it is unreadable. */
export function readStoredChatColumnOpen(): boolean {
    const raw: string | null = readFromSessionStorageWithLocalStorageFallback(STORAGE_KEY);
    return raw === 'true';
}

export function storeChatColumnOpen(open: boolean): void {
    storeInSessionStorageAndLocalStorage(STORAGE_KEY, String(open));
}
