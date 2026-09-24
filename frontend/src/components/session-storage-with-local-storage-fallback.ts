/* Session-first storage for a UI preference (the assistant column's width and
   open state): the tab's own entry wins for the life of the tab, and
   localStorage seeds a tab that has none, so a new tab starts as the last one
   left it. Every write goes to both stores — that is what keeps the fallback
   at the latest value from any tab. Each access is wrapped on its own, because
   either store can be blocked (a private window, a hardened browser) and a
   blocked store must cost nothing but the fallback or the caller's default;
   the warning names the store and the key. The conversation
   (chat-conversation-storage.ts) deliberately does not use this: it is
   content, per tab, and must never outlive one. */

/** The tab's own entry, else the cross-tab one, else null. */
export function readFromSessionStorageWithLocalStorageFallback(key: string): string | null {
    let raw: string | null = null;
    try {
        raw = window.sessionStorage.getItem(key);
    } catch (error) {
        console.warn(`${key}: session storage unreadable`, error);
    }
    if (raw === null) {
        try {
            raw = window.localStorage.getItem(key);
        } catch (error) {
            console.warn(`${key}: local storage unreadable`, error);
        }
    }
    return raw;
}

export function storeInSessionStorageAndLocalStorage(key: string, value: string): void {
    try {
        window.sessionStorage.setItem(key, value);
    } catch (error) {
        console.warn(`${key}: session storage unwritable`, error);
    }
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`${key}: local storage unwritable`, error);
    }
}
