/** One call a recording fake kept: the method and its arguments exactly as passed. */
export interface RecordedServiceCall {
    method: string;
    arguments: unknown[];
}
