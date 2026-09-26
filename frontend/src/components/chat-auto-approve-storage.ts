/* The composer's auto-approve switch, remembered for the life of the tab
   (sessionStorage): a reload keeps it beside the conversation it applies to,
   a new tab starts with it off. sessionStorage only — unlike the column's
   width and open state, which localStorage seeds into a new tab — because a
   switch that lets the assistant stop and delete without asking must never
   arrive in a tab the person did not turn it on in. Every access is wrapped,
   as storage can be blocked; unreadable or absent means off. */

const STORAGE_KEY: string = 'ycp.assistantAutoApproveToolCalls';

/** The remembered state, or false when there is none or it is unreadable. */
export function readStoredChatAutoApproveToolCalls(): boolean {
    let raw: string | null;
    try {
        raw = window.sessionStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.warn('assistant auto-approve: storage unreadable', error);
        return false;
    }
    return raw === 'true';
}

export function storeChatAutoApproveToolCalls(autoApprove: boolean): void {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, String(autoApprove));
    } catch (error) {
        console.warn('assistant auto-approve: storage unwritable', error);
    }
}
