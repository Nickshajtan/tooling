/**
 * Scan configuration: the single source of default values, plus merge and validation.
 *
 * Config is DATA only (JSON-serializable). Code — adapters, fetcher, pageFactory — is passed to
 * `runCli()` / `scan()` separately. Precedence, lowest → highest:
 *
 *   DEFAULTS  →  tool config (runCli({ config }))  →  --config <file.json>  →  CLI flags
 *
 * The resolved config is written to run.json, so `--resume` reuses exactly the same settings.
 */

export { DEFAULTS } from './defaults.js';
export { loadConfigFile } from './load.js';
export type { LoadedConfigFile } from './load.js';
export { mergeConfig } from './merge.js';
export { validateConfig } from './validate.js';
export type { ValidationContext } from './sections/section-validator.js';
export type {
    AdapterOptionsMap,
    DeepPartial,
    FailOn,
    HttpConfig,
    OutputConfig,
    PartialScanConfig,
    PluginOptionsMap,
    ScanSettings,
    ScanConfig,
    SitesConfig,
} from './types.js';
