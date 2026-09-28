import type { ReplyExpectation } from '../cases/interfaces.ts';
import type { CaseScore } from './interfaces.ts';

/**
 * Scores a reply against a case's `ReplyExpectation`: every `mustMention`
 * entry must appear in the reply (one of its alternatives, when the entry is
 * a list), and no `mustNotMention` fragment may. Fragments are matched
 * case-insensitively as plain substrings of the reply as the model wrote it,
 * markdown included, so a name inside backticks or a figure inside bold
 * still counts.
 */
export function scoreReplyExpectation(expectation: ReplyExpectation, replyText: string): CaseScore {
    const problems: string[] = [];
    const reply: string = replyText.toLowerCase();

    for (const entry of expectation.mustMention) {
        let alternatives: string[];
        if (Array.isArray(entry)) {
            alternatives = entry;
        } else {
            alternatives = [entry];
        }
        const mentioned: boolean = alternatives.some((fragment: string) => reply.includes(fragment.toLowerCase()));
        if (!mentioned) {
            problems.push(`reply does not mention ${describeAlternatives(alternatives)}`);
        }
    }

    for (const fragment of expectation.mustNotMention) {
        if (reply.includes(fragment.toLowerCase())) {
            problems.push(`reply says ${JSON.stringify(fragment)}`);
        }
    }

    return { passed: problems.length === 0, problems: problems };
}

function describeAlternatives(alternatives: string[]): string {
    return alternatives.map((fragment: string) => JSON.stringify(fragment)).join(' or ');
}
