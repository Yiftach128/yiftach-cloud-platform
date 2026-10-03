/**
 * The self-healing wrapper every daemon request goes through: a request that
 * found the daemon unreachable gets the daemon booted and one more try; a
 * refusal the daemon itself answered is mapped and never retried. The
 * lifecycle is `RecordingDockerDaemonLifecycle`; the request is a scripted
 * function of this file's own that fails as told and counts its calls.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DaemonRequestRunner } from '../../../src/services/docker/daemon-request-runner.ts';
import { RecordingDockerDaemonLifecycle } from './fakes/recording-docker-daemon-lifecycle.ts';

const BASE_URL = 'http://127.0.0.1:2375';

test('a request the daemon was not up for gets the daemon booted and one more try, whose answer is returned', async () => {
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    const runner: DaemonRequestRunner = new DaemonRequestRunner(daemon, BASE_URL);
    const request: ScriptedRequest = new ScriptedRequest([connectionRefused()]);

    const answer: string = await runner.run('GET /containers/json', (): Promise<string> => request.run());

    assert.equal(answer, 'ok');
    assert.equal(daemon.ensureRunningCalls, 1);
    assert.equal(request.calls, 2);
});

test('a second connection failure after the boot is a DockerConnectionError naming the endpoint; there is no third try', async () => {
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    const runner: DaemonRequestRunner = new DaemonRequestRunner(daemon, BASE_URL);
    const request: ScriptedRequest = new ScriptedRequest([connectionRefused(), connectionRefused()]);

    await assert.rejects(
        runner.run('GET /containers/json', (): Promise<string> => request.run()),
        { name: 'DockerConnectionError', message: /^Cannot reach the Docker daemon at http:\/\/127\.0\.0\.1:2375\. / },
    );
    assert.equal(daemon.ensureRunningCalls, 1);
    assert.equal(request.calls, 2);
});

test('a refusal the daemon answered is a DockerApiError with its status and the endpoint, with no boot and no retry', async () => {
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    const runner: DaemonRequestRunner = new DaemonRequestRunner(daemon, BASE_URL);
    const request: ScriptedRequest = new ScriptedRequest([engineError('No such container: web', 404)]);

    await assert.rejects(
        runner.run('GET /containers/web/json', (): Promise<string> => request.run()),
        { name: 'DockerApiError', message: 'No such container: web', status: 404, endpoint: 'GET /containers/web/json' },
    );
    assert.equal(daemon.ensureRunningCalls, 0);
    assert.equal(request.calls, 1);
});

test("when the daemon will not boot, the lifecycle's own error reaches the caller and the request is not retried", async () => {
    const daemon: RecordingDockerDaemonLifecycle = new RecordingDockerDaemonLifecycle();
    const bootFailure: Error = new Error('the distro did not start');
    daemon.failWith(bootFailure);
    const runner: DaemonRequestRunner = new DaemonRequestRunner(daemon, BASE_URL);
    const request: ScriptedRequest = new ScriptedRequest([connectionRefused()]);

    await assert.rejects(
        runner.run('GET /containers/json', (): Promise<string> => request.run()),
        (error: unknown): boolean => error === bootFailure,
    );
    assert.equal(request.calls, 1);
});

test('without a lifecycle (the mounted-socket deployment) a connection failure is a DockerConnectionError at once, with the socket hint', async () => {
    const runner: DaemonRequestRunner = new DaemonRequestRunner(undefined, 'unix:///var/run/docker.sock');
    const request: ScriptedRequest = new ScriptedRequest([errorWithCode('ENOENT')]);

    await assert.rejects(
        runner.run('GET /containers/json', (): Promise<string> => request.run()),
        { name: 'DockerConnectionError', message: /^Cannot reach the Docker daemon at unix:\/\/\/var\/run\/docker\.sock\. .*mounted/ },
    );
    assert.equal(request.calls, 1);
});

/** A daemon request that throws the listed failures first, in order, then answers 'ok'; counts its calls. */
class ScriptedRequest {
    calls: number = 0;
    private readonly failures: Error[];

    constructor(failures: Error[]) {
        this.failures = failures;
    }

    async run(): Promise<string> {
        this.calls = this.calls + 1;
        const failure: Error | undefined = this.failures.shift();
        if (failure !== undefined) {
            throw failure;
        }
        return 'ok';
    }
}

/** The error Node's socket layer raises when nothing listens on the port. */
function connectionRefused(): Error {
    return errorWithCode('ECONNREFUSED');
}

function errorWithCode(code: string): Error {
    return Object.assign(new Error(`connect ${code}`), { code: code });
}

/** The error docker-modem raises when the daemon answered with a non-2xx status. */
function engineError(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode: statusCode });
}
