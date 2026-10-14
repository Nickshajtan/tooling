import { isRecord } from '../shared/is-record.js';
import { identityProblems, PluginKind, throwIfInvalid, type AssertPluginOptions, type PluginIdentity } from './plugin.js';
import type { ScanRecord } from './record.js';
import type { ReportFile } from './reporter.js';
import type { RunMeta } from './run-meta.js';

/**
 * Persists exactly one run: its metadata, its records and the files reporters produce. Contract rules (enforced by
 * the shared conformance suite in tests/store-conformance.ts):
 *  - `append` resolves only once the record is durable: a crash after it resolves must not lose that record.
 *  - `records()` yields records in append order and silently drops a partially written final record.
 *  - `create` on a location that already holds a run is an error. Resuming is `readMeta` + `records`, never `create`.
 *  - `writeArtifact` rejects unsafe names (see shared/safe-name.ts) and collisions with `run.json` / `raw.jsonl`.
 *  - Listing or searching across runs is out of scope.
 */
export interface RunStore {
    /** Id of the factory that opened it, e.g. `fs`. */
    readonly id: string;
    /** Human-readable, for logs and stdout: a directory path, a URL… */
    readonly location: string;
    /** True if this run exists (replaces the old `isRunDir`). Never creates anything. */
    exists(): Promise<boolean>;
    create(meta: RunMeta): Promise<void>;
    readMeta(): Promise<RunMeta | null>;
    append(record: ScanRecord): Promise<void>;
    records(): AsyncIterable<ScanRecord>;
    /** Stores one reporter output file and returns its location. */
    writeArtifact(file: ReportFile): Promise<string>;
}

export interface StoreOpenContext<O = unknown> {
    /**
     * `<tool>-<YYYYMMDD-HHmmss>` for a new run, or exactly what `--out` / `--resume` / `report` /
     * `--from-run` was given. How a store interprets it is that store's own documentation.
     */
    readonly runId: string;
    /** For the built-in `fs` store: `{ dir }` (the `output.dir` setting). */
    readonly options: O;
    /** Directory relative paths resolve against (the working directory). */
    readonly baseDir: string;
}

/** The plugin: how a store is opened from config. */
export interface RunStoreFactory<O = unknown> extends PluginIdentity {
    open(context: StoreOpenContext<O>): RunStore;
}

export function assertStore(factory: unknown, options: AssertPluginOptions = {}): asserts factory is RunStoreFactory {
    const candidate = isRecord(factory) ? factory : {};
    const problems = identityProblems(PluginKind.STORE, candidate, options);
    if (typeof candidate.open !== 'function') {
        problems.push('open must be a function');
    }
    throwIfInvalid(PluginKind.STORE, candidate, problems);
}

/** Validates a store factory right away so mistakes fail before a long run starts. */
export function defineStore<O = unknown>(factory: RunStoreFactory<O>): Readonly<RunStoreFactory<O>> {
    assertStore(factory);

    return Object.freeze(factory);
}

/** For stores shipped by the engine only (may use reserved ids). Not exported from the package. */
export function defineBuiltinStore<O = unknown>(factory: RunStoreFactory<O>): Readonly<RunStoreFactory<O>> {
    assertStore(factory, { builtin: true });

    return Object.freeze(factory);
}
