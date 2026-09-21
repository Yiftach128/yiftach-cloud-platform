/**
 * Validates the POST /chat body: `{turns: [{role: 'user' | 'assistant', text}, ...]}`,
 * the whole conversation with the question being asked as its last turn.
 * Throws {@link ValidationError} (→ 400).
 *
 * The caps guard against junk, not against long conversations — those are the
 * agent's history window to handle. Only the last turn has a length cap,
 * because it is the one turn that window always keeps; an older turn that is
 * too long simply falls outside it.
 */

import type { ChatTurn } from '../ai-agent/interfaces.ts';
import { ValidationError } from './validation-error.ts';

const MAX_TURNS = 100;
const MAX_LAST_TURN_CHARS = 4_000;

export function parseChatRequest(body: unknown): ChatTurn[] {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const rawTurns = record['turns'];
    if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
        throw new ValidationError('"turns" must be a non-empty array');
    }
    if (rawTurns.length > MAX_TURNS) {
        throw new ValidationError(`"turns" must hold at most ${MAX_TURNS} turns`);
    }

    const turns: ChatTurn[] = [];
    for (let index = 0; index < rawTurns.length; index++) {
        turns.push(parseTurn(rawTurns[index], index));
    }

    const lastTurn: ChatTurn | undefined = turns[turns.length - 1];
    if (lastTurn === undefined || lastTurn.role !== 'user') {
        throw new ValidationError('The last turn must be a "user" turn');
    }
    if (lastTurn.text.length > MAX_LAST_TURN_CHARS) {
        throw new ValidationError(`The last turn's "text" must be at most ${MAX_LAST_TURN_CHARS} characters`);
    }
    return turns;
}

function parseTurn(rawTurn: unknown, index: number): ChatTurn {
    if (typeof rawTurn !== 'object' || rawTurn === null || Array.isArray(rawTurn)) {
        throw new ValidationError(`turns[${index}] must be a JSON object`);
    }
    const record = rawTurn as Record<string, unknown>;

    const role = record['role'];
    if (role !== 'user' && role !== 'assistant') {
        throw new ValidationError(`turns[${index}].role must be "user" or "assistant"`);
    }

    const text = record['text'];
    if (typeof text !== 'string' || text.trim() === '') {
        throw new ValidationError(`turns[${index}].text must be a non-empty string`);
    }

    return { role: role, text: text };
}
