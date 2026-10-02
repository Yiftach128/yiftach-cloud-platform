import { PassThrough } from 'node:stream';

import type { FollowProgressFn } from '../../../../src/services/docker/drain-progress-stream.ts';

/**
 * The tests' stand-in for dockerode's `followProgress`, driven by the test:
 * `follow` keeps the two callbacks the drainer hands over, `emit` delivers one
 * progress event and `end` finishes the stream cleanly. The stream is a real
 * `PassThrough`, so destroying it with an error reaches `onFinished` exactly
 * as dockerode reports a stream error.
 */
export class ManualProgressFeed {
    readonly stream: PassThrough = new PassThrough();
    private onFinished: ((error: Error | null, output: unknown[]) => void) | undefined = undefined;
    private onProgress: ((event: unknown) => void) | undefined = undefined;

    readonly follow: FollowProgressFn = (stream, onFinished, onProgress): void => {
        this.onFinished = onFinished;
        this.onProgress = onProgress;
        stream.on('error', (error: Error): void => {
            onFinished(error, []);
        });
    };

    emit(event: unknown): void {
        if (this.onProgress === undefined) {
            throw new Error('ManualProgressFeed: nothing follows the stream yet');
        }
        this.onProgress(event);
    }

    end(): void {
        if (this.onFinished === undefined) {
            throw new Error('ManualProgressFeed: nothing follows the stream yet');
        }
        this.onFinished(null, []);
    }
}
