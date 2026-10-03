/** Share of the budget spent on the start of an oversized result; the rest goes to its end. */
const HEAD_SHARE = 0.4;

/**
 * Cuts an oversized tool result down to `budgetChars`, keeping its start and
 * its end and saying what was removed. Both ends matter: the start carries the
 * header or the first rows, the end carries the newest log lines. A result that
 * fits is returned unchanged.
 */
export function trimToolResultToBudget(text: string, budgetChars: number): string {
    if (text.length <= budgetChars) {
        return text;
    }
    const headChars: number = Math.floor(budgetChars * HEAD_SHARE);
    const tailChars: number = budgetChars - headChars;
    const cutChars: number = text.length - headChars - tailChars;
    const head: string = text.substring(0, headChars);
    const tail: string = text.substring(text.length - tailChars);
    return `${head}\n... [${cutChars} characters cut here to fit the context window] ...\n${tail}`;
}
