import type { ReplyExpectation } from '../cases/interfaces.ts';
import type { CaseScore } from './interfaces.ts';

/**
 * Scores a reply against a case's `ReplyExpectation`: every `mustMention`
 * entry must appear in the reply (one of its alternatives, when the entry is
 * a list), and no `mustNotMention` fragment may. Fragments are matched
 * case-insensitively as plain substrings of the reply as the model wrote it,
 * markdown included, so a name inside backticks or a figure inside bold
 * still counts — after `normalizeTextForMatching` on both sides, so a model's
 * typographic spaces and hyphens do not hide a figure or an id.
 */
export function scoreReplyExpectation(expectation: ReplyExpectation, replyText: string): CaseScore {
    const problems: string[] = [];
    const reply: string = normalizeTextForMatching(replyText);

    for (const entry of expectation.mustMention) {
        let alternatives: string[];
        if (Array.isArray(entry)) {
            alternatives = entry;
        } else {
            alternatives = [entry];
        }
        const mentioned: boolean = alternatives.some((fragment: string) => reply.includes(normalizeTextForMatching(fragment)));
        if (!mentioned) {
            problems.push(`reply does not mention ${describeAlternatives(alternatives)}`);
        }
    }

    for (const fragment of expectation.mustNotMention) {
        if (reply.includes(normalizeTextForMatching(fragment))) {
            problems.push(`reply says ${JSON.stringify(fragment)}`);
        }
    }

    return { passed: problems.length === 0, problems: problems };
}

/**
 * The first alternative — the canonical phrasing — and how many others would
 * have counted, so a reason stays one line where a list of twenty phrasings
 * said nothing more; the case file has the whole list.
 */
function describeAlternatives(alternatives: string[]): string {
    const first: string | undefined = alternatives[0];
    if (first === undefined) {
        return '(nothing — the expectation lists no phrasing)';
    }
    if (alternatives.length === 1) {
        return JSON.stringify(first);
    }
    const second: string | undefined = alternatives[1];
    if (alternatives.length === 2 && second !== undefined) {
        return `${JSON.stringify(first)} or ${JSON.stringify(second)}`;
    }
    return `${JSON.stringify(first)} or ${alternatives.length - 1} other phrasings`;
}

/**
 * One shape for whitespace and hyphens before matching: models write figures
 * with a narrow no-break space ("9.8 MiB" from granite, U+202F) and ids with
 * non-breaking hyphens, which a plain substring match cannot see through.
 * Every Unicode space becomes a plain one, runs of them collapse, the
 * typographic hyphens (U+2010 to U+2012) and the minus sign become "-", and
 * the text is lowercased.
 */
function normalizeTextForMatching(text: string): string {
    return text
        .replace(/[\u2010\u2011\u2012\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}
