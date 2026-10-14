# Types

**Who this is for:** anyone writing against the public contract. Every exported type is listed here with one line of purpose;
the source of truth is `src/index.ts` and the file named in the *Defined in* column. `Context` always means "the object for
one unit of work passed through a stage".

Related: [architecture](architecture.md) · [formats](formats.md) · [events](events.md)

Typing rules: no anonymous shapes in signatures; data is `readonly` interfaces, behavior is classes; engine-owned data given
to plugins is frozen; option bags are `XxxOptions`, results `XxxResult`, plugin inputs `XxxContext`; extension points
(`TargetState`, `EngineEvents`) are open interfaces tools augment.

## Plugin contract

| Type | Purpose | Defined in |
| --- | --- | --- |
| `PluginIdentity` | `id`, `description`, `engine` range, optional `options` schema shared by all five kinds | `contract/plugin.ts` |
| `SiteSource<O>`, `SourceContext<O>` | Turns config into `Site[]`; context carries `options`, `baseDir`, `signal` | `contract/source.ts` |
| `Adapter`, `AdapterResult`, `Finding`, `SummaryTable`, `RowValue` | A check: page → row + findings | `contract/adapter.ts` |
| `Reporter<O>`, `ReportContext<O>`, `ReportFile`, `ReportStream` | Records → files; render or streaming mode | `contract/reporter.ts` |
| `Extension<O>`, `ExtensionApi<O>` | Registers middleware and listeners in `setup()` | `contract/extension.ts` |
| `RunStoreFactory<O>`, `StoreOpenContext<O>`, `RunStore` | Opens and persists one run | `contract/store.ts` |
| `OptionSchema`, `OptionSpec`, `OptionType` | Declarative per-plugin option schema | `contract/options.ts` |

## Run data (strict, versioned)

| Type | Purpose | Defined in |
| --- | --- | --- |
| `Site` | One scan root a source returns | `contract/site.ts` |
| `SiteFilter` | `all` / `active` / `public` | `contract/site-filter.ts` |
| `ScanRecord`, `HttpSummary` | One line of `raw.jsonl` | `contract/record.ts` |
| `RunMeta` | Contents of `run.json` | `contract/run-meta.ts` |
| `Severity` | `error` / `warning` / `info` | `contract/severity.ts` |
| `EngineCode` | Codes of the reserved `engine` findings | `contract/engine-code.ts` |
| `RECORD_SCHEMA_VERSION` | Current record schema (`1`) | `contract/record.ts` |

## Scanning

| Type | Purpose | Defined in |
| --- | --- | --- |
| `ScanTarget` | Immutable identity of one site × path | `contract/target.ts` |
| `TargetState` | Open per-page bag extensions write and adapters read | `contract/target.ts` |
| `TargetContext`, `FetchContext` | Per-unit-of-work objects passed through the stages (classes) | `scan/contexts.ts` |
| `AdapterContext<O>` | Frozen read-only view an adapter receives | `contract/adapter-context.ts` |
| `Middleware<C>`, `Stage`, `StageContexts` | The onion function and the three stages | `contract/middleware.ts` |
| `FetchRequest`, `SideRequest`, `FetchResponse`, `Redirect` | HTTP request/response shapes | `contract/fetch.ts` |
| `FetchError`, `FetchPurpose` | Stable error codes; `page` vs `side` | `contract/fetch.ts` |
| `Engine`, `EngineSetup`, `ScanRunOptions` | The class that runs scans | `scan/engine.ts` |

## Events

| Type | Purpose | Defined in |
| --- | --- | --- |
| `EngineEvents` | Open map of event name → payload | `contract/events.ts` |
| `RunStartEvent`, `RunEndEvent`, `TargetStartEvent`, `TargetEndEvent`, `FetchStartEvent`, `FetchEndEvent`, `AdapterEndEvent`, `WarningEvent` | Payloads | `contract/events.ts`, `contract/warning.ts` |
| `EventListener<K>`, `ExtensionEventName` | Listener type; `ext:<id>:<name>` pattern | `contract/events.ts` |

## Config

| Type | Purpose | Defined in |
| --- | --- | --- |
| `ScanConfig`, `SitesConfig`, `ScanSettings`, `HttpConfig`, `OutputConfig` | Resolved config | `config/types.ts` |
| `PartialScanConfig`, `DeepPartial<T>` | One config layer | `config/types.ts` |
| `PluginOptionsMap`, `AdapterOptionsMap`, `FailOn` | Option maps and the exit threshold | `config/types.ts` |

## Building blocks and CLI

| Type | Purpose | Defined in |
| --- | --- | --- |
| `LoadSitesOptions`, `LoadSitesResult` | `loadSites()` in and out | `input/index.ts` |
| `RunReportersOptions`, `RunReportersResult`, `ReportSink` | `runReporters()` in and out; where records come from and files go | `report/index.ts` |
| `RunCliOptions` | Everything `runCli()` takes, incl. injectable `stdout`, `stderr`, `env`, `signals`, `now`, `clock`, `cwd` | `cli/options.ts` |
| `TextSink` | Anything text can be written to | `cli/options.ts` |
| `SignalSource` | Where Ctrl+C comes from (injectable for tests) | `cli/signals.ts` |
| `ExitCode` | `0` ok, `1` error, `2` threshold reached, `130` interrupted | `cli/exit-code.ts` |
| `ErrorCode`, `CliError`, `Problem` | Stable error codes and the structured error | `cli/errors.ts` |

## Values exported next to the types

| Export | Purpose |
| --- | --- |
| `defineAdapter`, `defineSource`, `defineReporter`, `defineExtension`, `defineStore` | Validate a plugin immediately and freeze it |
| `finding(code, severity, message, detail?)` | Builds a `Finding` and guards against a mistyped severity |
| `csvSource`, `urlSource` | The built-in sources (for tools that call `loadSites` themselves) |
| `BUILTIN_REPORTERS` | The three built-in reporters, in default order |
| `retryExtension`, `hostMapExtension` | The built-in extensions (for tools that build an `Engine` themselves) |
| `fsStore` | The built-in run store factory |
| `DEFAULTS`, `mergeConfig`, `validateConfig`, `loadConfigFile` | Config helpers |
| `RunAlreadyExistsError`, `UnsupportedSchemaError` | Errors a store or the CLI raises |
