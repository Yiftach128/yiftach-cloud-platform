import type {
    CloneRepositoryOptions,
    ReadHeadCommitOptions,
    RepositoryCloneService,
} from '../../../../src/services/git/interfaces.ts';

/**
 * The tests' `RepositoryCloneService`: keeps every call's options as passed,
 * answers the commit the test set, and throws the error a test hands
 * `failWith` for a method. It clones nothing — the target folder stays as the
 * caller made it — and knows no rule of git.
 */
export class RecordingRepositoryCloneService implements RepositoryCloneService {
    /** The options of every `cloneRepository` call, in order. */
    readonly cloneCalls: CloneRepositoryOptions[] = [];
    /** The options of every `readHeadCommit` call, in order. */
    readonly readHeadCommitCalls: ReadHeadCommitOptions[] = [];
    /** What `readHeadCommit` answers. */
    headCommit: string = '4f2a9c1e'.repeat(5);
    private readonly failures: Map<string, Error> = new Map();

    failWith(method: keyof RepositoryCloneService, failure: Error): void {
        this.failures.set(method, failure);
    }

    async cloneRepository(options: CloneRepositoryOptions): Promise<void> {
        this.cloneCalls.push(options);
        this.throwInjectedFailure('cloneRepository');
    }

    async readHeadCommit(options: ReadHeadCommitOptions): Promise<string> {
        this.readHeadCommitCalls.push(options);
        this.throwInjectedFailure('readHeadCommit');
        return this.headCommit;
    }

    private throwInjectedFailure(method: keyof RepositoryCloneService): void {
        const failure: Error | undefined = this.failures.get(method);
        if (failure !== undefined) {
            throw failure;
        }
    }
}
