/** Pure formatting helpers: durations, counts, percentages, ETA, paths, plurals. */

import { relative } from 'node:path';

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`;
}

export function formatCount(count: number): string {
    return count.toLocaleString('en-US');
}

/** `45 ms`, `3.2 s`, `4m 05s`, `1h 03m`. */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)} ms`;
    }
    const seconds = Math.round(ms / 1000);
    if (ms < 10_000) {
        return `${(ms / 1000).toFixed(1)} s`;
    }
    if (seconds < 60) {
        return `${seconds} s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
    }

    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Coarse duration for estimates: `~45 min`, `~2 h`, `< 1 min`. */
export function formatEstimate(ms: number): string {
    const minutes = ms / 60_000;
    if (minutes < 1) {
        return '< 1 min';
    }

    return minutes < 90 ? `~${Math.round(minutes)} min` : `~${Math.round(minutes / 60)} h`;
}

export function formatPercent(done: number, total: number): string {
    return total === 0 ? '100%' : `${Math.floor((done / total) * 100)}%`;
}

/** Time left at the observed rate; `null` until there is a rate to go by. */
export function etaMs(done: number, total: number, elapsedMs: number): number | null {
    if (done === 0 || elapsedMs <= 0) {
        return null;
    }

    return ((total - done) / done) * elapsedMs;
}

export function formatRate(done: number, elapsedMs: number): string {
    return elapsedMs <= 0 ? '0.0' : (done / (elapsedMs / 1000)).toFixed(1);
}

/** A path relative to `cwd` when it is inside it, else as given. */
export function displayPath(path: string, cwd: string): string {
    const rel = relative(cwd, path);

    return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/') ? rel : path;
}

/** `▕██████░░░░▏` */
export function progressBar(done: number, total: number, width = 20): string {
    const filled = total === 0 ? width : Math.min(width, Math.floor((done / total) * width));

    return `▕${'█'.repeat(filled)}${'░'.repeat(width - filled)}▏`;
}
