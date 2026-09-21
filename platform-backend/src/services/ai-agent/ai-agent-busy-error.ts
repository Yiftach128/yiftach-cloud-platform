/**
 * A chat run was asked for while another one is still in progress. Maps to
 * HTTP 429 — one model on one GPU answers one conversation at a time.
 */
export class AiAgentBusyError extends Error {
    constructor() {
        super('The assistant is busy answering another conversation; try again when it has finished');
        this.name = 'AiAgentBusyError';
    }
}
