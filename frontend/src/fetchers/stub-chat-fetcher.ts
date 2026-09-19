import { ChatFetcherError } from './chat-fetcher-error.ts';
import type { ChatFetcher, ChatTurn } from './interfaces.ts';

/** Delay before the first fragment, standing in for the model's thinking time. */
const FIRST_FRAGMENT_DELAY_MS: number = 600;
/** Delay between fragments. */
const FRAGMENT_INTERVAL_MS: number = 40;
/** Sending exactly this text makes the stub fail, so the UI's error state can be seen. */
const FAIL_COMMAND: string = '/fail';

/**
 * Temporary stand-in for the chat backend: streams a canned reply word by word
 * so the chat UI's streaming, stop and error states can be exercised before
 * the platform's chat endpoint exists. Delete once the real fetcher lands.
 */
export class StubChatFetcher implements ChatFetcher {
    public async streamReply(turns: ChatTurn[], onDelta: (textDelta: string) => void, signal: AbortSignal): Promise<void> {
        let lastUserText: string = '';
        for (const turn of turns) {
            if (turn.role === 'user') {
                lastUserText = turn.text;
            }
        }

        await this.sleep(FIRST_FRAGMENT_DELAY_MS, signal);
        if (signal.aborted) {
            return;
        }
        if (lastUserText === FAIL_COMMAND) {
            throw new ChatFetcherError('The stub chat backend failed, as asked.');
        }

        const reply: string =
            'This is a placeholder reply — the chat backend is not connected yet, so nothing was sent to a model.\n\n' +
            `You wrote: "${lastUserText}"\n\n` +
            'Once the backend exists, answers about your services, images and builds will stream in here the way this text does.';

        for (const fragment of this.toFragments(reply)) {
            if (signal.aborted) {
                return;
            }
            onDelta(fragment);
            await this.sleep(FRAGMENT_INTERVAL_MS, signal);
        }
    }

    /** Words with their trailing whitespace, so the fragments concatenate back to the exact text. */
    private toFragments(text: string): string[] {
        const fragments: RegExpMatchArray | null = text.match(/\S+\s*/g);
        if (fragments === null) {
            return [];
        }
        return fragments;
    }

    /** Resolves after the delay, or at once when the signal aborts — never rejects. */
    private sleep(durationMs: number, signal: AbortSignal): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            if (signal.aborted) {
                resolve();
                return;
            }

            function handleAbort(): void {
                clearTimeout(timer);
                resolve();
            }

            const timer: number = window.setTimeout(() => {
                signal.removeEventListener('abort', handleAbort);
                resolve();
            }, durationMs);

            signal.addEventListener('abort', handleAbort, { once: true });
        });
    }
}
