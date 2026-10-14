/** View models: what the commands hand to the UI. Plain data, no formatting. */

export const OutputLevel = {
    DEFAULT: 'default',
    QUIET: 'quiet',
    VERBOSE: 'verbose',
    JSON: 'json',
} as const;

export type OutputLevel = (typeof OutputLevel)[keyof typeof OutputLevel];

export interface PlanView {
    readonly tool: string;
    readonly engineVersion: string;
    readonly sites: {
        readonly source: string;
        /** Human label of where the sites come from: a file path, or the source id. */
        readonly label: string;
        readonly loaded: number;
        readonly filter: string;
        readonly afterFilter: number;
        readonly excludedPrivate: number;
        readonly excludedInactive: number;
        /** Sites dropped because they had an `--exclude-code` finding in the `--from-run` run. */
        readonly excludedByRun: number;
        /** Rows the source returned that failed validation. */
        readonly dropped: number;
    };
    readonly pages: number;
    readonly paths: readonly string[];
    readonly checks: readonly string[];
    readonly fetching: {
        readonly concurrency: number;
        readonly delayMs: number;
        readonly timeoutMs: number;
        /** Extra tries of the `retry` extension, or null when it is not active. */
        readonly retryAttempts: number | null;
    };
    readonly extensions: readonly string[];
    readonly output: { readonly location: string; readonly reporters: readonly string[] };
    /** Rough wall-clock estimate from concurrency and pause; null when there is nothing to scan. */
    readonly estimateMs: number | null;
    readonly resume: { readonly done: number; readonly left: number } | null;
}

export interface ProgressView {
    readonly done: number;
    readonly total: number;
    readonly elapsedMs: number;
    readonly ok: number;
    readonly failed: number;
    readonly errors: number;
    readonly warnings: number;
}

export interface TargetLine {
    readonly done: number;
    readonly total: number;
    readonly siteId: string;
    readonly path: string;
    readonly status: number;
    readonly timingMs: number;
    readonly error: string;
}

export const NotableKind = {
    FETCH: 'fetch',
    ADAPTER: 'adapter',
} as const;

export type NotableKind = (typeof NotableKind)[keyof typeof NotableKind];

export interface NotableView {
    readonly kind: NotableKind;
    readonly message: string;
    /** Fetch failures: the error type, so only the first of each type is listed. */
    readonly errorType?: string;
}

export interface WarningView {
    readonly source: string;
    readonly message: string;
}

export interface SummaryView {
    readonly tool: string;
    readonly durationMs: number;
    readonly pages: number;
    readonly ok: number;
    readonly fetchFailed: number;
    readonly findings: { readonly error: number; readonly warning: number; readonly info: number };
    readonly topCodes: readonly { readonly code: string; readonly count: number }[];
    readonly failureTypes: readonly { readonly type: string; readonly count: number }[];
    /** Files the reporters wrote (as the store reports them). */
    readonly written: readonly string[];
    readonly location: string;
    readonly warningCount: number;
    readonly adapterTimings: readonly { readonly adapterId: string; readonly totalMs: number; readonly pages: number }[];
    readonly interrupted: boolean;
    readonly threshold: { readonly level: string; readonly reached: boolean } | null;
    /** The one follow-up command worth suggesting, or null. */
    readonly next: string | null;
}

export interface ReportDoneView {
    readonly written: readonly string[];
}

export interface OptionListing {
    readonly name: string;
    readonly type: string;
    readonly summary: string;
    readonly required: boolean;
    readonly default?: unknown;
}

export interface PluginListing {
    readonly id: string;
    readonly engine: string;
    readonly description: string;
    /** `null` = the plugin declares no option schema (its options are not validated). */
    readonly options: readonly OptionListing[] | null;
}

export interface PluginListView {
    readonly groups: readonly { readonly kind: string; readonly plugins: readonly PluginListing[] }[];
}

export interface ConfigEntry {
    readonly path: string;
    readonly value: string;
    readonly origin: string;
}

export interface ErrorContext {
    readonly tool: string;
    /** The command the user ran, when known (for the "--help" hint). */
    readonly command: string | null;
}

/** One strategy per output level. The commands only ever talk to this interface. */
export interface OutputMode {
    readonly level: OutputLevel;
    /** Help text (stdout). */
    help(text: string): void;
    plan(view: PlanView): void;
    /** A page finished (per-page lines are verbose-only). */
    target(line: TargetLine): void;
    progress(view: ProgressView): void;
    notable(note: NotableView): void;
    warning(warning: WarningView): void;
    interrupted(inFlight: number): void;
    summary(view: SummaryView): void;
    reportDone(view: ReportDoneView): void;
    /** `validate` finished: everything resolved, nothing was fetched. */
    validated(): void;
    pluginList(view: PluginListView): void;
    /** Effective config values with their origins (`validate --verbose`). */
    effectiveConfig(entries: readonly ConfigEntry[]): void;
    error(err: unknown, context: ErrorContext): void;
    /** Ends any live line so the next write starts clean. */
    close(): void;
}
