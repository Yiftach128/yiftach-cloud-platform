import type {
    ImageDetails,
    ImageExposedPort,
    ImageService,
    ImageSummary,
} from '../../../../src/services/docker/interfaces.ts';
import type { RecordedServiceCall } from './interfaces.ts';

/**
 * The tests' `ImageService`: answers each method with what the test set on it,
 * whatever reference is asked for, keeps every call with its arguments as
 * passed, and throws the error a test hands `failWith` for a method. It knows
 * no rule of the real service: an unmanaged image's refusal is injected,
 * never derived from a label.
 */
export class RecordingImageService implements ImageService {
    /** Every call made, in order, with the arguments as passed. */
    readonly calls: RecordedServiceCall[] = [];
    /** What `getManagedImages` answers. */
    images: ImageSummary[] = [];
    /** What `getManagedImageDetails` answers; a test that needs it sets it. */
    details: ImageDetails | undefined = undefined;
    /** What `getImageExposedPorts` answers. */
    exposedPorts: ImageExposedPort[] = [];
    private readonly failures: Map<string, Error> = new Map();

    failWith(method: keyof ImageService, failure: Error): void {
        this.failures.set(method, failure);
    }

    async ensureImageExists(reference: string): Promise<void> {
        this.recordCall('ensureImageExists', [reference]);
    }

    async getManagedImages(): Promise<ImageSummary[]> {
        this.recordCall('getManagedImages', []);
        return this.images;
    }

    async getManagedImageDetails(id: string): Promise<ImageDetails> {
        this.recordCall('getManagedImageDetails', [id]);
        if (this.details === undefined) {
            throw new Error('RecordingImageService: no details set');
        }
        return this.details;
    }

    async getImageExposedPorts(reference: string): Promise<ImageExposedPort[]> {
        this.recordCall('getImageExposedPorts', [reference]);
        return this.exposedPorts;
    }

    async deleteManagedImage(id: string): Promise<void> {
        this.recordCall('deleteManagedImage', [id]);
    }

    /** Keeps the call, then throws the method's injected failure when there is one. */
    private recordCall(method: keyof ImageService, callArguments: unknown[]): void {
        this.calls.push({ method: method, arguments: callArguments });
        const failure: Error | undefined = this.failures.get(method);
        if (failure !== undefined) {
            throw failure;
        }
    }
}
