import type { PartialScanConfig } from '../config/index.js';
import type { Adapter } from '../contract/adapter.js';
import type { Extension } from '../contract/extension.js';
import type { Reporter } from '../contract/reporter.js';
import type { SiteSource } from '../contract/source.js';
import type { RunStoreFactory } from '../contract/store.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { SignalSource } from './signals.js';
import type { Terminal, TerminalStream } from './ui/terminal.js';
import type { OutputMode } from './ui/views.js';

export type { TerminalStream as TextSink };

export interface RunCliOptions {
    /** Tool name; used in help, run.json and the default run directory. */
    readonly name: string;
    /** The tool's own version, shown in the plan header. */
    readonly version?: string;
    readonly adapters: readonly Adapter[];
    /** Extra site sources; built-ins `csv` and `url` are always available. */
    readonly sources?: readonly SiteSource[];
    /** Extra reporters; built-ins `results-csv`, `findings-csv`, `summary-md` are always available. */
    readonly reporters?: readonly Reporter[];
    /** Extra run stores; the built-in `fs` store is always available. */
    readonly stores?: readonly RunStoreFactory[];
    /** Extra extensions (middleware + listeners); built-ins `retry` and `host-map` are always available. A tool extension runs only when listed in `scan.extensions`. */
    readonly extensions?: readonly Extension[];
    /** Tool-level config defaults (data only). */
    readonly config?: PartialScanConfig;
    readonly argv?: readonly string[];
    /** Where output goes. `isTTY` / `columns` decide live progress and width. */
    readonly stdout?: TerminalStream;
    readonly stderr?: TerminalStream;
    /** Environment for `NO_COLOR` / `FORCE_COLOR`. Default: `process.env`. */
    readonly env?: Readonly<Record<string, string | undefined>>;
    /** Source of Ctrl+C. Default: the real SIGINT. */
    readonly signals?: SignalSource;
    readonly now?: () => Date;
    /** Monotonic milliseconds for durations and redraw throttling. Default: `performance.now()`. */
    readonly clock?: () => number;
    /** Working directory relative paths resolve against. Default: `process.cwd()`. */
    readonly cwd?: string;
}

/** Everything a command needs; defaults are already applied. */
export interface CommandContext {
    readonly name: string;
    readonly version: string | undefined;
    readonly adapters: readonly Adapter[];
    readonly registry: PluginRegistry;
    /** Extensions the tool passed in (not the built-ins); the engine adds the built-ins itself. */
    readonly toolExtensions: readonly Extension[];
    readonly toolConfig: PartialScanConfig;
    readonly mode: OutputMode;
    readonly terminal: Terminal;
    readonly signals: SignalSource;
    readonly now: () => Date;
    readonly clock: () => number;
    readonly cwd: string;
}
