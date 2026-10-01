/** One Server-Sent Event as a test reads it off the wire: the `event:` name and its `data:` line parsed as JSON. */
export interface ServerSentEvent {
    event: string;
    data: unknown;
}
