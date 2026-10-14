import { etaMs, formatCount, formatDuration, formatPercent, formatRate, progressBar } from './format.js';
import type { Theme } from './theme.js';
import type { ProgressView } from './views.js';

/** Same fields for the TTY live line and the non-TTY periodic line; only the bar is TTY-only. */
export function renderProgress(view: ProgressView, theme: Theme, withBar: boolean): string {
    const eta = etaMs(view.done, view.total, view.elapsedMs);
    const parts = [
        ...(withBar ? [progressBar(view.done, view.total)] : []),
        formatPercent(view.done, view.total),
        `${formatCount(view.done)}/${formatCount(view.total)}`,
        `${formatRate(view.done, view.elapsedMs)} p/s`,
        eta === null ? 'ETA …' : `ETA ${formatDuration(eta)}`,
        `${theme.success('✓')} ${formatCount(view.ok)} ${view.failed > 0 ? theme.error('✖') : '✖'} ${formatCount(view.failed)}`,
        `findings: ${formatCount(view.errors)} err ${formatCount(view.warnings)} warn`,
    ];

    return parts.join(' · ');
}

/** Non-TTY output is one plain line every 5% or 30 s, whichever comes first. */
export class PeriodicGate {
    private lastPercent = -1;
    private lastAt = Number.NEGATIVE_INFINITY;

    constructor(private readonly everyPercent = 5, private readonly everyMs = 30_000) {}

    /** True when a line is due. Always true at completion. */
    due(done: number, total: number, nowMs: number): boolean {
        const percent = total === 0 ? 100 : Math.floor((done / total) * 100);
        const finished = done >= total;
        if (finished || percent - this.lastPercent >= this.everyPercent || nowMs - this.lastAt >= this.everyMs) {
            this.lastPercent = percent;
            this.lastAt = nowMs;

            return true;
        }

        return false;
    }
}

/** Live-line redraws are limited to once per 200 ms. */
export class RedrawGate {
    private lastAt = Number.NEGATIVE_INFINITY;

    constructor(private readonly everyMs = 200) {}

    due(nowMs: number, force = false): boolean {
        if (force || nowMs - this.lastAt >= this.everyMs) {
            this.lastAt = nowMs;

            return true;
        }

        return false;
    }
}
