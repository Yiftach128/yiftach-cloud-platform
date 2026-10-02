/** Types of the stand-in platform server the API client tests talk to. */

/** One request the stand-in received, its JSON body parsed (or the raw text when it was not JSON). */
export interface StandInRequest {
    method: string;
    path: string;
    body: unknown;
}

/** The answer scripted for the next request; an empty `bodyText` sends no body. */
export interface StandInResponse {
    status: number;
    bodyText: string;
}
