/** The model server could not be reached at all, or stopped answering mid-reply. */
export class LlmUnavailableError extends Error {
    constructor(baseUrl: string, detail: string, cause: unknown) {
        super(`Cannot reach the model server at ${baseUrl}: ${detail}`);
        this.name = 'LlmUnavailableError';
        this.cause = cause;
    }
}
