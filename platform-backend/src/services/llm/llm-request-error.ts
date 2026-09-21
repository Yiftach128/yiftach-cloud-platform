/**
 * The model server was reached but refused or failed the request — an unknown
 * model, a model without tool support, a malformed reply.
 */
export class LlmRequestError extends Error {
    /** HTTP status of the refusal; 0 when the failure arrived inside a 200 stream. */
    readonly status: number;

    constructor(status: number, detail: string) {
        super(`The model server failed the request: ${detail}`);
        this.name = 'LlmRequestError';
        this.status = status;
    }
}
