import { displayPath, formatCount, formatDuration, plural } from './format.js';
import type { Theme } from './theme.js';
import type { SummaryView } from './views.js';

const LABEL_WIDTH = 11;
const TOP = 3;

function row(theme: Theme, label: string, text: string): string {
    return `  ${theme.dim(label.padEnd(LABEL_WIDTH))}${text}`;
}

/** The end-of-run block. `verbose` adds per-adapter timings. */
export function renderSummary(view: SummaryView, theme: Theme, cwd: string, verbose: boolean): string {
    const headline = view.interrupted
        ? theme.warn(`■ Stopped after ${formatDuration(view.durationMs)} · ${plural(view.pages, 'page')} scanned`)
        : `${theme.success('✔')} Done in ${formatDuration(view.durationMs)} · ${plural(view.pages, 'page')} · ${formatCount(view.ok)} ok · ${formatCount(view.fetchFailed)} failed to fetch`;
    const lines = [headline, ''];

    const findings = `${formatCount(view.findings.error)} error · ${formatCount(view.findings.warning)} warning · ${formatCount(view.findings.info)} info`;
    const top = view.topCodes.slice(0, TOP).map((entry) => `${entry.code} ${formatCount(entry.count)}`).join(' · ');
    lines.push(row(theme, 'Findings', top ? `${findings}   (top: ${top})` : findings));
    if (view.failureTypes.length > 0) {
        lines.push(row(theme, 'Failures', `${view.failureTypes.map((entry) => `${entry.type} ${formatCount(entry.count)}`).join(' · ')}   → see findings (adapter=engine)`));
    }
    if (view.warningCount > 0) {
        lines.push(row(theme, 'Warnings', plural(view.warningCount, 'warning')));
    }
    lines.push(row(theme, 'Reports', displayPath(view.location, cwd)));
    const files = view.written.map((path) => displayPath(path, cwd));
    if (files.length > 0) {
        lines.push(row(theme, '', files.join(' · ')));
    }
    if (verbose && view.adapterTimings.length > 0) {
        lines.push(row(theme, 'Adapters', view.adapterTimings
            .map((entry) => `${entry.adapterId} ${formatDuration(entry.pages === 0 ? 0 : entry.totalMs / entry.pages)}/page`).join(' · ')));
    }
    if (view.next) {
        lines.push('', row(theme, 'Next', theme.code(view.next)));
    }
    if (view.threshold?.reached) {
        lines.push('', theme.error(`✖ Threshold "${view.threshold.level}" reached → exit 2`));
    }

    return `${lines.join('\n')}\n`;
}
