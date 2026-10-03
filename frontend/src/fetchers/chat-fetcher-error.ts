/**
 * The one error type a ChatFetcher rejects with. Components match on this
 * instead of on the transport's internals, the way DockerFetcherError shields
 * them from axios.
 */
export class ChatFetcherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChatFetcherError';
    }
}
