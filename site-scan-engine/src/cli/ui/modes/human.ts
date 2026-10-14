import { CliError } from '../../errors.js';
import { renderCliError, renderInternalError } from '../errors.js';
import { plural } from '../format.js';
import { renderPlan } from '../plan.js';
import { PeriodicGate, RedrawGate, renderProgress } from '../progress.js';
import { renderSummary } from '../summary.js';
import type { Terminal } from '../terminal.js';
import type { Theme } from '../theme.js';
import {
    NotableKind,
    OutputLevel,
    type ConfigEntry,
    type ErrorContext,
    type NotableView,
    type OutputMode,
    type PlanView,
    type PluginListView,
    type ProgressView,
    type ReportDoneView,
    type SummaryView,
    type TargetLine,
    type WarningView,
} from '../views.js';

/** What a human-readable level shows. The level matrix of PLAN §6b.6 as data. */
export interface LevelPolicy {
    readonly level: OutputLevel;
    readonly plan: boolean;
    readonly liveProgress: boolean;
    readonly perPageLines: boolean;
    /** Fetch failures: list only the first of each type (false = list all). */
    readonly firstFetchFailurePerType: boolean;
    /** Warnings printed inline before the rest are only counted. */
    readonly warningLimit: number;
    readonly summaryBlock: boolean;
    readonly adapterTimings: boolean;
}

export const HUMAN_POLICIES = {
    [OutputLevel.DEFAULT]: { level: OutputLevel.DEFAULT, plan: true, liveProgress: true, perPageLines: false, firstFetchFailurePerType: true, warningLimit: 5, summaryBlock: true, adapterTimings: false },
    [OutputLevel.QUIET]: { level: OutputLevel.QUIET, plan: false, liveProgress: false, perPageLines: false, firstFetchFailurePerType: true, warningLimit: 0, summaryBlock: false, adapterTimings: false },
    [OutputLevel.VERBOSE]: { level: OutputLevel.VERBOSE, plan: true, liveProgress: true, perPageLines: true, firstFetchFailurePerType: false, warningLimit: Number.POSITIVE_INFINITY, summaryBlock: true, adapterTimings: true },
} as const satisfies Record<Exclude<OutputLevel, typeof OutputLevel.JSON>, LevelPolicy>;

export interface HumanModeDeps {
    readonly terminal: Terminal;
    readonly theme: Theme;
    readonly cwd: string;
    /** Monotonic-ish milliseconds, injectable so tests can drive the redraw/periodic gates. */
    readonly clock: () => number;
}

/** default / quiet / verbose: stderr gets the decoration, stdout only the final file list and run location. */
export class HumanMode implements OutputMode {
    readonly level: OutputLevel;
    private readonly redrawGate = new RedrawGate();
    private readonly periodicGate = new PeriodicGate();
    private readonly seenFetchTypes = new Set<string>();
    private liveLine: string | null = null;
    private printedWarnings = 0;

    constructor(private readonly policy: LevelPolicy, private readonly deps: HumanModeDeps) {
        this.level = policy.level;
    }

    private get terminal(): Terminal {
        return this.deps.terminal;
    }

    /** Writes a line to stderr without trampling the live progress line. */
    private writeAbove(text: string): void {
        if (this.liveLine !== null) {
            this.terminal.endLine();
        }
        this.terminal.err(text);
        if (this.liveLine !== null) {
            this.terminal.redraw(this.liveLine);
        }
    }

    help(text: string): void {
        this.terminal.out(text);
    }

    plan(view: PlanView): void {
        if (this.policy.plan) {
            this.terminal.err(`${renderPlan(view, this.deps.theme, this.deps.cwd)}\n`);
        }
    }

    target(line: TargetLine): void {
        if (!this.policy.perPageLines) {
            return;
        }
        const status = line.error ? `✗ ${line.error}` : `${line.status} ${line.timingMs}ms`;
        this.writeAbove(`[${line.done}/${line.total}] ${line.siteId} ${line.path} ${status}\n`);
    }

    progress(view: ProgressView): void {
        if (!this.policy.liveProgress) {
            return;
        }
        const now = this.deps.clock();
        const finished = view.done >= view.total;
        if (this.terminal.interactive) {
            const line = renderProgress(view, this.deps.theme, true);
            this.liveLine = line;
            if (this.redrawGate.due(now, finished)) {
                this.terminal.redraw(line);
            }

            return;
        }
        if (this.periodicGate.due(view.done, view.total, now)) {
            this.terminal.err(`${renderProgress(view, this.deps.theme, false)}\n`);
        }
    }

    notable(note: NotableView): void {
        if (this.policy.level === OutputLevel.QUIET) {
            return;
        }
        const { theme } = this.deps;
        if (note.kind === NotableKind.ADAPTER) {
            this.writeAbove(`${theme.error('✖')} ${note.message}\n`);

            return;
        }
        const type = note.errorType ?? note.message;
        if (this.policy.firstFetchFailurePerType && this.seenFetchTypes.has(type)) {
            return;
        }
        const first = !this.seenFetchTypes.has(type);
        this.seenFetchTypes.add(type);
        const suffix = this.policy.firstFetchFailurePerType && first ? theme.dim(` (more ${type} will be counted, not listed)`) : '';
        this.writeAbove(`${theme.error('✖')} ${note.message}${suffix}\n`);
    }

    warning(warning: WarningView): void {
        if (this.printedWarnings >= this.policy.warningLimit) {
            return;
        }
        this.printedWarnings += 1;
        this.writeAbove(`${this.deps.theme.warn('!')} Warning: ${warning.source}: ${warning.message}\n`);
    }

    interrupted(inFlight: number): void {
        this.writeAbove(`${this.deps.theme.warn('■')} Stopping… finishing ${plural(inFlight, 'page')} in flight (Ctrl+C again to force)\n`);
    }

    summary(view: SummaryView): void {
        this.close();
        if (this.policy.summaryBlock) {
            const hidden = view.warningCount - Math.min(view.warningCount, this.printedWarnings);
            this.terminal.err(`\n${renderSummary({ ...view, warningCount: hidden > 0 ? view.warningCount : 0 }, this.deps.theme, this.deps.cwd, this.policy.adapterTimings)}`);
        }
        // The stdout contract: the files, then the run location on the last line (so `$(tool scan … | tail -1)` works).
        this.terminal.out(`${[...view.written, view.location].join('\n')}\n`);
    }

    reportDone(view: ReportDoneView): void {
        if (view.written.length > 0) {
            this.terminal.out(`${view.written.join('\n')}\n`);
        }
    }

    validated(): void {
        if (this.policy.level !== OutputLevel.QUIET) {
            this.terminal.err(`${this.deps.theme.success('✔')} Configuration is valid. No requests were made.\n`);
        }
    }

    pluginList(view: PluginListView): void {
        const { theme } = this.deps;
        const lines: string[] = [];
        for (const group of view.groups) {
            lines.push(theme.emph(`${group.kind} (${group.plugins.length})`));
            for (const plugin of group.plugins) {
                lines.push(`  ${theme.code(plugin.id)}  ${theme.dim(`engine ${plugin.engine}`)}`, `    ${plugin.description}`);
                if (plugin.options === null) {
                    lines.push(`    ${theme.warn('no option schema')}: options are not validated`);
                    continue;
                }
                for (const option of plugin.options) {
                    const detail = [option.type, option.required ? 'required' : null, option.default !== undefined ? `default ${JSON.stringify(option.default)}` : null].filter(Boolean).join(', ');
                    lines.push(`      ${option.name} ${theme.dim(`(${detail})`)} ${option.summary}`);
                }
            }
            lines.push('');
        }
        this.terminal.out(`${lines.join('\n')}\n`);
    }

    effectiveConfig(entries: readonly ConfigEntry[]): void {
        const width = Math.max(0, ...entries.map((entry) => entry.path.length));
        const lines = entries.map((entry) => `  ${entry.path.padEnd(width)} = ${entry.value}  ${this.deps.theme.dim(`(${entry.origin})`)}`);
        this.terminal.err(`${['Effective configuration:', ...lines].join('\n')}\n\n`);
    }

    error(err: unknown, context: ErrorContext): void {
        this.close();
        const text = err instanceof CliError
            ? renderCliError(err, this.deps.theme, context)
            : renderInternalError(err, this.deps.theme, context);
        this.terminal.err(text);
    }

    close(): void {
        if (this.liveLine !== null) {
            this.terminal.endLine();
            this.liveLine = null;
        }
    }
}
