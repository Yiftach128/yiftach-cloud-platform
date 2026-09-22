/* The one piece of UI state the app remembers across reloads: the width the
   user dragged the assistant column to. Without it every reload would snap
   the column back to its default and the drag would be pointless. Every
   access is wrapped, because storage can be blocked (a private window, a
   hardened browser) and a blocked store must cost nothing but the default
   width. */

const STORAGE_KEY: string = 'ycp.assistantColumnWidth';

/** The remembered width, or null when there is none or it is unreadable. */
export function readStoredChatColumnWidth(): number | null {
    let raw: string | null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.warn('assistant column width: storage unreadable', error);
        return null;
    }
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
    try {
        window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch (error) {
        console.warn('assistant column width: storage unwritable', error);
    }
}
