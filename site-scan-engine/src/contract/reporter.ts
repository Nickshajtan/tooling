import { isRecord } from '../shared/is-record.js';
import type { Adapter } from './adapter.js';
import { identityProblems, PluginKind, throwIfInvalid, type AssertPluginOptions, type PluginIdentity } from './plugin.js';
import type { ScanRecord } from './record.js';
import type { RunMeta } from './run-meta.js';

export interface ReportFile {
    /** Relative, e.g. `results.csv` or `jira/import.csv`. */
    readonly name: string;
    readonly content: string | Uint8Array;
}

export interface ReportContext<O = unknown> {
    readonly adapters: readonly Adapter[];
    /** run.json contents. */
    readonly run: RunMeta;
    /** `config.output.options[reporter.id]` */
    readonly options: O;
}

export interface ReportStream {
    write(record: ScanRecord): Promise<void> | void;
    close(): Promise<readonly ReportFile[]> | readonly ReportFile[];
}

/**
 * A reporter implements exactly ONE of two modes; the engine picks streaming when `open` is present.
 *  - render: all records at once, sorted by numeric siteId then path.
 *  - open:   constant memory, records arrive in completion (raw.jsonl) order, NOT sorted.
 */
export interface Reporter<O = unknown> extends PluginIdentity {
    render?(records: readonly ScanRecord[], context: ReportContext<O>): Promise<readonly ReportFile[]> | readonly ReportFile[];
    open?(context: ReportContext<O>): Promise<ReportStream> | ReportStream;
}

export function assertReporter(reporter: unknown, options: AssertPluginOptions = {}): asserts reporter is Reporter {
    const candidate = isRecord(reporter) ? reporter : {};
    const problems = identityProblems(PluginKind.REPORTER, candidate, options);
    const hasRender = candidate.render !== undefined;
    const hasOpen = candidate.open !== undefined;

    if (hasRender && typeof candidate.render !== 'function') {
        problems.push('render must be a function');
    }
    if (hasOpen && typeof candidate.open !== 'function') {
        problems.push('open must be a function');
    }
    if (hasRender && hasOpen) {
        problems.push('implement either render or open, not both');
    }
    if (!hasRender && !hasOpen) {
        problems.push('implement render or open');
    }
    throwIfInvalid(PluginKind.REPORTER, candidate, problems);
}

/** Validates a reporter definition right away so mistakes fail before a long run starts. */
export function defineReporter<O = unknown>(reporter: Reporter<O>): Readonly<Reporter<O>> {
    assertReporter(reporter);

    return Object.freeze(reporter);
}

/** For reporters shipped by the engine only (may use reserved ids). Not exported from the package. */
export function defineBuiltinReporter<O = unknown>(reporter: Reporter<O>): Readonly<Reporter<O>> {
    assertReporter(reporter, { builtin: true });

    return Object.freeze(reporter);
}
