/**
 * Public API of @cet/site-scan-engine. This is the only entry point consumers import.
 * Grouped by who uses it; see README.md "Responsibilities".
 */

// Contract — what a tool implements.
export { defineAdapter, finding } from './contract/adapter.js';
export { OptionType } from './contract/options.js';
export type { OptionSchema, OptionSpec } from './contract/options.js';
export { defineExtension } from './contract/extension.js';
export type { Extension, ExtensionApi } from './contract/extension.js';
export type { Middleware, Stage, StageContexts } from './contract/middleware.js';
export type { AdapterContext } from './contract/adapter-context.js';
export type { ScanTarget, TargetState } from './contract/target.js';
export { FetchError, FetchPurpose } from './contract/fetch.js';
export type { FetchRequest, FetchResponse, Redirect, SideRequest } from './contract/fetch.js';
export type {
    AdapterEndEvent, EngineEvents, EventListener, ExtensionEventName, FetchEndEvent, FetchStartEvent,
    RunEndEvent, RunStartEvent, TargetEndEvent, TargetStartEvent,
} from './contract/events.js';
export { defineReporter } from './contract/reporter.js';
export type { ReportContext, ReportFile, ReportStream, Reporter } from './contract/reporter.js';
export type { RunMeta } from './contract/run-meta.js';
export { defineSource } from './contract/source.js';
export type { SiteSource, SourceContext } from './contract/source.js';
export type { PluginIdentity } from './contract/plugin.js';
export type { WarningEvent } from './contract/warning.js';
export { RECORD_SCHEMA_VERSION } from './contract/record.js';
export type { Adapter, AdapterResult, Finding, RowValue, SummaryTable } from './contract/adapter.js';
export { EngineCode } from './contract/engine-code.js';
export { Severity } from './contract/severity.js';
export type { HttpSummary, ScanRecord } from './contract/record.js';

// Config — data that controls a run.
export { DEFAULTS, mergeConfig, validateConfig, loadConfigFile } from './config/index.js';
export type {
    AdapterOptionsMap,
    FailOn,
    HttpConfig,
    OutputConfig,
    PartialScanConfig,
    PluginOptionsMap,
    ScanSettings,
    ScanConfig,
    SitesConfig,
} from './config/index.js';

// Whole-run entry point — what most tools call.
export { runCli, ExitCode } from './cli/index.js';
export { ErrorCode, CliError } from './cli/errors.js';
export type { Problem } from './cli/errors.js';
export type { SignalSource } from './cli/signals.js';
export type { RunCliOptions, TextSink } from './cli/index.js';

// Building blocks — for tools that need their own orchestration instead of runCli().
export { SiteFilter } from './contract/site-filter.js';
export type { Site } from './contract/site.js';
export { loadSites } from './input/index.js';
export type { LoadSitesOptions, LoadSitesResult } from './input/index.js';
export { csvSource } from './input/sources/csv.js';
export { urlSource } from './input/sources/url.js';
export { Engine } from './scan/engine.js';
export type { EngineSetup, ScanRunOptions } from './scan/engine.js';
export { retryExtension } from './scan/extensions/retry.js';
export { hostMapExtension } from './scan/extensions/host-map.js';
export { FetchContext, TargetContext } from './scan/contexts.js';
export { defineStore } from './contract/store.js';
export type { RunStore, RunStoreFactory, StoreOpenContext } from './contract/store.js';
export { fsStore } from './storage/fs-store.js';
export { RunAlreadyExistsError, UnsupportedSchemaError } from './storage/errors.js';
export { runReporters } from './report/index.js';
export type { ReportSink, RunReportersOptions, RunReportersResult } from './report/index.js';
export { BUILTIN_REPORTERS } from './report/reporters/index.js';
