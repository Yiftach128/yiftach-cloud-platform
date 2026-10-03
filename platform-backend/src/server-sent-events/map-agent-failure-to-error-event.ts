import { LlmRequestError } from '../services/llm/llm-request-error.ts';
import { LlmUnavailableError } from '../services/llm/llm-unavailable-error.ts';
import type { ChatErrorEvent } from './interfaces.ts';

/**
 * Maps a failed agent run onto the `error` event that ends a chat stream — the
 * counterpart of `middleware/error-handler.ts` for failures that arrive after
 * the stream has opened, when the status line is already sent. The message is
 * shown to the person chatting. The two model-server failures pass theirs
 * through untouched: the provider client already words them for a reader and
 * says what to check, which only it can know.
 */
export function mapAgentFailureToErrorEvent(error: unknown): ChatErrorEvent {
    if (error instanceof LlmUnavailableError) {
        return { type: 'error', code: 'llm_unavailable', message: error.message };
    }
    if (error instanceof LlmRequestError) {
        return { type: 'error', code: 'llm_request_failed', message: error.message };
    }
    let detail: string;
    if (error instanceof Error) {
        detail = error.message;
    } else {
        detail = String(error);
    }
    return { type: 'error', code: 'internal', message: `The assistant failed unexpectedly: ${detail}` };
}
