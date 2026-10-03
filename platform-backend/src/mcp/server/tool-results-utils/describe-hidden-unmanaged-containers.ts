/**
 * The sentence a list or stats result carries when it left containers out —
 * inside the result, where a model reads it at the moment it decides what to
 * do next. The count alone (`hiddenUnmanagedCount`) was not enough: asked
 * about a compose container, a 4B model read the count, guessed the container
 * was unmanaged, and asked the user instead of calling again; a sentence in
 * the tool description did not change that, and a rule in the system prompt
 * made it set includeUnmanaged to false on purpose (eval
 * `memory-usage-of-unmanaged-container`, 2026-09-28). Conditional wording on
 * purpose: a list that was not looking for anything must not re-call.
 */
export function describeHiddenUnmanagedContainers(hiddenUnmanagedCount: number): string | undefined {
    if (hiddenUnmanagedCount === 0) {
        return undefined;
    }
    let subject: string;
    if (hiddenUnmanagedCount === 1) {
        subject = '1 container the platform did not create is';
    } else {
        subject = `${hiddenUnmanagedCount} containers the platform did not create are`;
    }
    return `${subject} not listed. A container the user asked about that is missing here is one of them: `
        + 'call this tool again with includeUnmanaged: true.';
}
