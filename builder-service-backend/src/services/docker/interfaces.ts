/** Docker daemon endpoint for the image builder: a unix socket, or else a TCP host and port. */
export interface ImageBuilderServiceOptions {
    /** Unix socket to reach the daemon over (e.g. "/var/run/docker.sock"). When set, host and port are unused. */
    socketPath: string | undefined;
    host: string | undefined;
    port: number | undefined;
}

/** One image build from an already-cloned workspace directory. */
export interface BuildImageOptions {
    /** Directory holding the repository content (Dockerfile at its root). */
    contextDir: string;
    /** Tag the built image gets. */
    tag: string;
    /** Extra labels stamped on the image (build provenance); the managed label is always added on top. */
    extraLabels: Record<string, string>;
    /** Receives each human-readable build progress line. */
    onProgressLine: (line: string) => void;
}
