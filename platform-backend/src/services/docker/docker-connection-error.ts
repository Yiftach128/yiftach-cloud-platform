/** The daemon could not be reached at all. */
export class DockerConnectionError extends Error {
    constructor(baseUrl: string, cause: unknown) {
        let hint: string;
        if (baseUrl.startsWith('unix://')) {
            hint =
                `Check that dockerd is running and that this process may open the socket — in a ` +
                `container it must be mounted (\`-v /var/run/docker.sock:/var/run/docker.sock\`).`;
        } else {
            hint =
                `Check that the WSL distro is running (\`wsl -d Ubuntu -e true\`) and that dockerd is ` +
                `bound to an IPv4 address (\`wsl -d Ubuntu -u root ss -ltn | grep 2375\`).`;
        }

        super(`Cannot reach the Docker daemon at ${baseUrl}. ${hint}`);
        this.name = 'DockerConnectionError';
        this.cause = cause;
    }
}
