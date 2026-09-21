import type { ChatTurn } from './interfaces.ts';

/**
 * Picks the part of a conversation the model gets to read: the newest turns
 * whose text fits `budgetChars` together, in their original order. The chat UI
 * sends the whole conversation every time, and a long one would otherwise push
 * the prompt out of the model's context window, which the model server
 * truncates silently.
 *
 * The newest turn — the question being asked — is always kept, whatever its
 * size. Older turns are taken newest first, and the walk stops at the first one
 * that does not fit, so the kept part never has a gap in it. A kept part that
 * opens on an assistant turn loses that turn too: an answer whose question was
 * cut away tells the model nothing.
 */
export function selectRecentTurnsWithinBudget(turns: ChatTurn[], budgetChars: number): ChatTurn[] {
    const selected: ChatTurn[] = [];
    let usedChars: number = 0;

    for (let index = turns.length - 1; index >= 0; index--) {
        const turn: ChatTurn | undefined = turns[index];
        if (turn === undefined) {
            continue;
        }
        const isNewestTurn: boolean = index === turns.length - 1;
        if (!isNewestTurn && usedChars + turn.text.length > budgetChars) {
            break;
        }
        selected.unshift(turn);
        usedChars = usedChars + turn.text.length;
    }

    let oldest: ChatTurn | undefined = selected[0];
    while (selected.length > 1 && oldest !== undefined && oldest.role === 'assistant') {
        selected.shift();
        oldest = selected[0];
    }
    return selected;
}
