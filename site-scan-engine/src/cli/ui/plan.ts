import { displayPath, formatCount, formatEstimate, plural } from './format.js';
import type { Theme } from './theme.js';
import type { PlanView } from './views.js';

const LABEL_WIDTH = 11;

function row(theme: Theme, label: string, text: string): string {
    return `  ${theme.dim(label.padEnd(LABEL_WIDTH))}${text}`;
}

function sitesLine(view: PlanView['sites']): string {
    const excluded: string[] = [];
    if (view.excludedPrivate > 0) {
        excluded.push(`${formatCount(view.excludedPrivate)} private`);
    }
    if (view.excludedInactive > 0) {
        excluded.push(`${formatCount(view.excludedInactive)} inactive`);
    }
    if (view.excludedByRun > 0) {
        excluded.push(`${formatCount(view.excludedByRun)} by --exclude-code`);
    }
    const skipped = view.excludedPrivate + view.excludedInactive + view.excludedByRun;
    const detail = skipped > 0 ? `  (${formatCount(skipped)} skipped: ${excluded.join(', ')})` : '';
    const dropped = view.dropped > 0 ? `  · ${plural(view.dropped, 'invalid row')} dropped` : '';

    return skipped > 0 || view.filter !== 'all'
        ? `${formatCount(view.loaded)} from ${view.label}  →  ${formatCount(view.afterFilter)} after filter "${view.filter}"${detail}${dropped}`
        : `${formatCount(view.loaded)} from ${view.label}${dropped}`;
}

/** The run plan block, printed before the first request so the user can Ctrl+C before anything happens. */
export function renderPlan(view: PlanView, theme: Theme, cwd: string): string {
    const lines = [`${theme.emph(view.tool)} · engine ${view.engineVersion}`, ''];

    lines.push(row(theme, 'Sites', sitesLine(view.sites)));
    lines.push(row(theme, 'Pages', `${formatCount(view.pages)}  (${plural(view.paths.length, 'path')}: ${view.paths.join(', ')})`));
    lines.push(row(theme, 'Checks', view.checks.join(', ')));
    const fetching = [
        `${view.fetching.concurrency} in parallel`,
        `${view.fetching.delayMs} ms pause`,
        `${Math.round(view.fetching.timeoutMs / 1000)} s timeout`,
        ...(view.fetching.retryAttempts !== null && view.fetching.retryAttempts > 0 ? [`retry ×${view.fetching.retryAttempts}`] : []),
    ];
    lines.push(row(theme, 'Fetching', fetching.join(' · ')));
    if (view.extensions.length > 0) {
        lines.push(row(theme, 'Extensions', view.extensions.join(', ')));
    }
    const reporters = view.output.reporters.length > 0 ? view.output.reporters.join(', ') : 'none (records only)';
    lines.push(row(theme, 'Output', `${displayPath(view.output.location, cwd)}  →  ${reporters}`));
    if (view.estimateMs !== null) {
        lines.push(row(theme, 'Estimate', `${formatEstimate(view.estimateMs)}  (from concurrency and pause)`));
    }
    if (view.resume) {
        lines.push(row(theme, 'Resuming', `${formatCount(view.resume.done)} already done, ${formatCount(view.resume.left)} left`));
    }

    return `${lines.join('\n')}\n`;
}
