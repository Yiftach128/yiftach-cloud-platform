/** Types of the stand-in Ollama server the client tests talk to. */

/** One request the stand-in received, its JSON body parsed (or the raw text when it was not JSON). */
export interface StandInRequest {
    method: string;
    path: string;
    body: unknown;
}

/** The answer scripted for the next request; `holdOpen` leaves the response unfinished after the body. */
export interface StandInResponse {
    status: number;
    bodyText: string;
    holdOpen: boolean;
}
