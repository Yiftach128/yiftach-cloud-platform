import { ChatFetcherError } from './chat-fetcher-error.ts';
import type {
    ChatDoneStreamEvent,
    ChatErrorStreamEvent,
    ChatFetcher,
    ChatReplyEvent,
    ChatTurn,
    ServerSentEvent,
} from './interfaces.ts';
import { readServerSentEventsStream } from './read-server-sent-events-stream.ts';

/** Body the backend error handler sends (see platform-backend/src/middleware/error-handler.ts). */
interface ApiErrorBody {
    message: string;
}

/**
 * The backend refuses a body with more turns (MAX_TURNS in
 * platform-backend/src/services/validation/parse-chat-request.ts), so of a very
 * long conversation only the newest turns are sent. What the model actually
 * reads is a narrower window still, and the backend's to choose.
 */
const MAX_TURNS_SENT: number = 100;

/**
 * The chat backend: POST /chat on the platform, answered with a Server-Sent
 * Events stream. Plain `fetch` rather than axios, the one fetcher where that is
 * so — the reply has to be read while it arrives, which is `fetch`'s streamed
 * body. Throws only ChatFetcherError, so neither `fetch` nor the event format
 * leaks into components.
 */
export class ChatFetcherService implements ChatFetcher {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    public async streamReply(turns: ChatTurn[], onEvent: (event: ChatReplyEvent) => void, signal: AbortSignal): Promise<void> {
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turns: turns.slice(-MAX_TURNS_SENT) }),
                signal: signal,
            });
        } catch {
            // Stop is not an error — and an aborted fetch rejects exactly like an unreachable backend.
            if (signal.aborted) {
                return;
            }
            throw new ChatFetcherError('Backend is unreachable');
        }

        if (!response.ok) {
            throw new ChatFetcherError(await this.readErrorMessage(response));
        }
        if (response.body === null) {
            throw new ChatFetcherError('The backend sent an empty reply');
        }

        // The `done` or `error` that ends the stream; kept until the body is read out.
        const endingEvents: ServerSentEvent[] = [];

        /* The SSE event name is the data's `type`, so the data parses as that
           event. Anything with another name is not ours and is skipped. */
        function handleEvent(event: ServerSentEvent): void {
            if (event.event === 'delta' || event.event === 'tool_call' || event.event === 'tool_result') {
                onEvent(JSON.parse(event.data) as ChatReplyEvent);
            } else if (event.event === 'done') {
                onEvent(JSON.parse(event.data) as ChatDoneStreamEvent);
                endingEvents.push(event);
            } else if (event.event === 'error') {
                endingEvents.push(event);
            }
        }

        try {
            await readServerSentEventsStream(response.body, handleEvent);
        } catch {
            if (signal.aborted) {
                return;
            }
            throw new ChatFetcherError('The connection to the backend was lost while the reply was streaming');
        }

        const endingEvent: ServerSentEvent | undefined = endingEvents[0];
        if (endingEvent === undefined) {
            // The stream closed without `done` or `error`: the backend went away mid-reply.
            throw new ChatFetcherError('The reply ended unexpectedly; the backend closed the connection');
        }
        if (endingEvent.event === 'error') {
            const failure = JSON.parse(endingEvent.data) as ChatErrorStreamEvent;
            throw new ChatFetcherError(failure.message);
        }
    }

    /** The error handler's `{message}` when the response carries one — a dev-proxy failure, for one, does not. */
    private async readErrorMessage(response: Response): Promise<string> {
        try {
            const body = (await response.json()) as ApiErrorBody;
            if (typeof body.message === 'string') {
                return body.message;
            }
        } catch {
            // Not JSON — fall through to the status.
        }
        return `Backend request failed with status ${response.status}`;
    }
}
