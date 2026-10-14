import { EngineCode } from '../contract/engine-code.js';
import type { ScanRecord } from '../contract/record.js';
import type { Severity } from '../contract/severity.js';
import type { ProgressView, SummaryView } from './ui/views.js';

type SummaryBase = Pick<SummaryView, 'tool' | 'written' | 'location' | 'interrupted' | 'threshold' | 'next'>;

/** Descending by count, ties by name. */
function ranked(counts: ReadonlyMap<string, number>): [string, number][] {
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Counters for one scan session: they feed the progress line and the summary. */
export class RunStats {
    warningCount = 0;
    private total = 0;
    private done = 0;
    private ok = 0;
    private fetchFailed = 0;
    private startedAt: number;
    private readonly severities: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    private readonly codes = new Map<string, number>();
    private readonly failureTypes = new Map<string, number>();
    private readonly adapters = new Map<string, { totalMs: number; pages: number }>();

    constructor(private readonly clock: () => number) {
        this.startedAt = clock();
    }

    start(total: number): void {
        this.total = total;
        this.startedAt = this.clock();
    }

    add(record: ScanRecord): void {
        this.done += 1;
        if (record.http.error === '') {
            this.ok += 1;
        } else {
            this.fetchFailed += 1;
            this.failureTypes.set(record.http.error, (this.failureTypes.get(record.http.error) ?? 0) + 1);
        }
        for (const result of Object.values(record.adapters)) {
            for (const f of result.findings) {
                this.severities[f.severity] += 1;
                if (f.code !== EngineCode.FETCH_FAILED) {
                    this.codes.set(f.code, (this.codes.get(f.code) ?? 0) + 1);
                }
            }
        }
    }

    adapterTime(adapterId: string, ms: number): void {
        const entry = this.adapters.get(adapterId) ?? { totalMs: 0, pages: 0 };
        entry.totalMs += ms;
        entry.pages += 1;
        this.adapters.set(adapterId, entry);
    }

    get elapsedMs(): number {
        return this.clock() - this.startedAt;
    }

    get fetchFailures(): number {
        return this.fetchFailed;
    }

    progress(): ProgressView {
        return {
            done: this.done,
            total: this.total,
            elapsedMs: this.elapsedMs,
            ok: this.ok,
            failed: this.fetchFailed,
            errors: this.severities.error,
            warnings: this.severities.warning,
        };
    }

    summary(base: SummaryBase): SummaryView {
        return {
            ...base,
            durationMs: this.elapsedMs,
            pages: this.done,
            ok: this.ok,
            fetchFailed: this.fetchFailed,
            findings: { ...this.severities },
            topCodes: ranked(this.codes).map(([code, count]) => ({ code, count })),
            failureTypes: ranked(this.failureTypes).map(([type, count]) => ({ type, count })),
            warningCount: this.warningCount,
            adapterTimings: [...this.adapters].map(([adapterId, entry]) => ({ adapterId, ...entry })),
        };
    }
}
