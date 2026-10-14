import { isRecord } from '../shared/is-record.js';
import { identityProblems, PluginKind, throwIfInvalid, type AssertPluginOptions, type PluginIdentity } from './plugin.js';
import type { Site } from './site.js';

export interface SourceContext<O = unknown> {
    /** `config.sites.options[source.id]` */
    readonly options: O;
    /** Directory used to resolve relative paths (config file dir, or cwd). */
    readonly baseDir: string;
    readonly signal: AbortSignal;
}

/** Turns config into the list of sites to scan. Filtering (filter/siteIds/limit) is done by the engine afterwards. */
export interface SiteSource<O = unknown> extends PluginIdentity {
    load(context: SourceContext<O>): Promise<readonly Site[]> | AsyncIterable<Site>;
}

export function assertSource(source: unknown, options: AssertPluginOptions = {}): asserts source is SiteSource {
    const candidate = isRecord(source) ? source : {};
    const problems = identityProblems(PluginKind.SOURCE, candidate, options);
    if (typeof candidate.load !== 'function') {
        problems.push('load must be a function');
    }
    throwIfInvalid(PluginKind.SOURCE, candidate, problems);
}

/** Validates a source definition right away so mistakes fail before a long run starts. */
export function defineSource<O = unknown>(source: SiteSource<O>): Readonly<SiteSource<O>> {
    assertSource(source);

    return Object.freeze(source);
}

/** For sources shipped by the engine only (may use reserved ids). Not exported from the package. */
export function defineBuiltinSource<O = unknown>(source: SiteSource<O>): Readonly<SiteSource<O>> {
    assertSource(source, { builtin: true });

    return Object.freeze(source);
}
