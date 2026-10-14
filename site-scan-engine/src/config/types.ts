import type { Severity } from '../contract/severity.js';
import type { SiteFilter } from '../contract/site-filter.js';

export type FailOn = typeof Severity.ERROR | typeof Severity.WARNING | null;

/** Plugin options keyed by plugin id; only the selected/listed plugins' entries are used. */
export type PluginOptionsMap = Readonly<Record<string, unknown>>;

export interface SitesConfig {
    /** Id of the SiteSource to load sites from. */
    readonly source: string;
    /** Options keyed by source id; only the selected source's entry is passed to it. */
    readonly options: PluginOptionsMap;
    readonly filter: SiteFilter;
    readonly siteIds: readonly string[];
    readonly limit: number;
}

export interface ScanSettings {
    /** Paths fetched on every site, resolved against the site URL. */
    readonly paths: readonly string[];
    /** Parallel targets in flight. */
    readonly concurrency: number;
    /** Pause per worker after each page. */
    readonly delayMs: number;
    /** Ids of the active extensions. Order = middleware order: the first listed is the outermost. */
    readonly extensions: readonly string[];
    /** Options keyed by extension id. */
    readonly options: PluginOptionsMap;
}

export interface HttpConfig {
    readonly timeoutMs: number;
    readonly maxBytes: number;
    readonly maxRedirects: number;
    /** `user-agent` is not allowed here; it always comes from `userAgent`. */
    readonly userAgent: string;
    /** Sent on every request. Keys are lowercased on merge. */
    readonly headers: Readonly<Record<string, string>>;
}

export interface OutputConfig {
    /** Parent directory for run folders (`<dir>/<tool>-<timestamp>/`). */
    readonly dir: string;
    /** Id of the RunStoreFactory that persists the run. Only `fs` ships. */
    readonly store: string;
    /** Ids of the reporters to run, in order. An empty list is valid (records only). */
    readonly reporters: readonly string[];
    /** Options keyed by reporter id. */
    readonly options: PluginOptionsMap;
}

export type AdapterOptionsMap = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** Fully resolved scan configuration. Data only (JSON-serializable). */
export interface ScanConfig {
    readonly sites: SitesConfig;
    readonly scan: ScanSettings;
    readonly http: HttpConfig;
    readonly output: OutputConfig;
    /** Exit 2 if any finding at/above this level. */
    readonly failOn: FailOn;
    /** Per-adapter options → `context.options`. */
    readonly adapters: AdapterOptionsMap;
}

/** A config layer: any subset of keys; `undefined` means "not set by this layer". */
export type DeepPartial<T> = T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> | undefined }
      : T;

export type PartialScanConfig = DeepPartial<ScanConfig>;
