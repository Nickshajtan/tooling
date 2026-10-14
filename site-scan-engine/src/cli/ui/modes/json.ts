import { CliError, ErrorCode } from '../../errors.js';
import type { Terminal } from '../terminal.js';
import {
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

export const JsonEventType = {
    PLAN: 'plan',
    PROGRESS: 'progress',
    TARGET: 'target',
    NOTABLE: 'notable',
    WARNING: 'warning',
    INTERRUPTED: 'interrupted',
    SUMMARY: 'summary',
    REPORT: 'report',
    VALIDATED: 'validated',
    PLUGINS: 'plugins',
    CONFIG: 'config',
    ERROR: 'error',
} as const;

export type JsonEventType = (typeof JsonEventType)[keyof typeof JsonEventType];

/**
 * `--json`: one JSON object per line on stdout, nothing decorative, stderr left empty (apart from an internal bug,
 * which is also an `error` event). The payloads are the same view models the human modes render; there is no
 * separate data model. Schema: docs/cli.md.
 */
export class JsonMode implements OutputMode {
    readonly level = OutputLevel.JSON;

    constructor(private readonly terminal: Terminal, private readonly now: () => Date) {}

    private emit(type: JsonEventType, payload: object): void {
        // The envelope goes last, so no payload field can ever replace `type` or `ts`.
        this.terminal.out(`${JSON.stringify({ ...payload, type, ts: this.now().toISOString() })}\n`);
    }

    help(text: string): void {
        this.terminal.out(text);
    }

    plan(view: PlanView): void {
        this.emit(JsonEventType.PLAN, view);
    }

    target(line: TargetLine): void {
        this.emit(JsonEventType.TARGET, line);
    }

    progress(view: ProgressView): void {
        this.emit(JsonEventType.PROGRESS, view);
    }

    notable(note: NotableView): void {
        this.emit(JsonEventType.NOTABLE, note);
    }

    warning(warning: WarningView): void {
        this.emit(JsonEventType.WARNING, warning);
    }

    interrupted(inFlight: number): void {
        this.emit(JsonEventType.INTERRUPTED, { inFlight });
    }

    summary(view: SummaryView): void {
        this.emit(JsonEventType.SUMMARY, view);
    }

    reportDone(view: ReportDoneView): void {
        this.emit(JsonEventType.REPORT, view);
    }

    validated(): void {
        this.emit(JsonEventType.VALIDATED, { ok: true });
    }

    pluginList(view: PluginListView): void {
        this.emit(JsonEventType.PLUGINS, view);
    }

    effectiveConfig(entries: readonly ConfigEntry[]): void {
        this.emit(JsonEventType.CONFIG, { entries });
    }

    error(err: unknown, context: ErrorContext): void {
        if (err instanceof CliError) {
            this.emit(JsonEventType.ERROR, { code: err.code, problems: err.problems, command: context.command });

            return;
        }
        // An internal bug: the structured event on stdout, plus the stack on stderr so it is never lost.
        const message = err instanceof Error ? err.message : String(err);
        this.emit(JsonEventType.ERROR, { code: ErrorCode.Internal, problems: [{ what: message }], command: context.command });
        if (err instanceof Error && err.stack) {
            this.terminal.err(`${err.stack}\nThis is a bug in ${context.tool} or the engine, please report it.\n`);
        }
    }

    close(): void {}
}
