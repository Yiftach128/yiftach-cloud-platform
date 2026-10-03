import type { BuildImageOptions, ImageBuilderService } from '../../../../src/services/docker/interfaces.ts';

/**
 * The tests' `ImageBuilderService`: keeps every build's options as passed,
 * hands the progress lines the test set to the caller's `onProgressLine`, and
 * throws the error a test hands `failWith`. A test that must act while a build
 * is running sets `duringBuild`; the build ends when that returns. It builds
 * nothing and knows no rule of Docker.
 */
export class RecordingImageBuilderService implements ImageBuilderService {
    /** The options of every `buildImage` call, in order. */
    readonly builds: BuildImageOptions[] = [];
    /** The progress lines every build reports, in order. */
    progressLines: string[] = [];
    /** Runs inside every build, after its progress lines; the build waits for it. */
    duringBuild: (() => Promise<void>) | undefined = undefined;
    private failure: Error | undefined = undefined;

    failWith(failure: Error): void {
        this.failure = failure;
    }

    async buildImage(options: BuildImageOptions): Promise<void> {
        this.builds.push(options);
        for (const line of this.progressLines) {
            options.onProgressLine(line);
        }
        if (this.duringBuild !== undefined) {
            await this.duringBuild();
        }
        if (this.failure !== undefined) {
            throw this.failure;
        }
    }
}
