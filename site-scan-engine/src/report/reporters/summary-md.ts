import type { Adapter } from '../../contract/adapter.js';
import { ENGINE_ADAPTER_ID } from '../../contract/engine-code.js';
import type { ScanRecord } from '../../contract/record.js';
import { OptionType } from '../../contract/options.js';
import { defineBuiltinReporter, type ReportContext, type ReportFile } from '../../contract/reporter.js';
import type { RunMeta } from '../../contract/run-meta.js';
import { Severity } from '../../contract/severity.js';
import { OptionReader } from '../../shared/option-reader.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { sortRecords } from '../sort.js';

export const DEFAULT_RECHECK_MIN_ERROR_CODES = 2;

type Cell = string | number;

function table(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
    const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;

    return [
        line(headers),
        line(headers.map(() => '---')),
        ...rows.map((row) => line(row.map((c) => String(c).replaceAll('|', '\\|')))),
    ].join('\n');
}

export function buildSummaryMd(
    records: readonly ScanRecord[],
    adapters: readonly Adapter[],
    meta: RunMeta | null = null,
    recheckMinErrorCodes: number = DEFAULT_RECHECK_MIN_ERROR_CODES,
): string {
    const sorted = sortRecords(records);
    const out: string[] = ['# Scan summary', ''];

    out.push(`- Tool: ${meta?.tool ?? 'unknown'}`);
    out.push(`- Started: ${meta?.startedAt ?? 'unknown'}`);
    out.push(`- Paths: ${(meta?.config?.scan.paths ?? [...new Set(sorted.map((r) => r.path))]).join(', ')}`);
    out.push(`- Sites: ${new Set(sorted.map((r) => r.siteId)).size}`);
    out.push(`- Pages scanned: ${sorted.length}`);
    out.push('');

    const bySeverity: Record<string, number> = Object.fromEntries(Object.values(Severity).map((s) => [s, 0]));
    for (const record of sorted) {
        for (const result of Object.values(record.adapters)) {
            for (const f of result.findings) {
                bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
            }
        }
    }
    out.push('## Findings by severity', '', table(['Severity', 'Count'], Object.entries(bySeverity)), '');

    const ids = [ENGINE_ADAPTER_ID, ...adapters.map((a) => a.id)];
    for (const id of ids) {
        const sitesByCode = new Map<string, Set<string>>();
        for (const record of sorted) {
            for (const f of record.adapters[id]?.findings ?? []) {
                const sites = sitesByCode.get(f.code) ?? new Set<string>();
                sites.add(record.siteId);
                sitesByCode.set(f.code, sites);
            }
        }
        if (sitesByCode.size === 0 && id === ENGINE_ADAPTER_ID) {
            continue;
        }
        const rows = [...sitesByCode]
            .map(([code, set]): [string, number] => [code, set.size])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        out.push(`## ${id}: sites per finding code`, '', rows.length ? table(['Code', 'Sites'], rows) : '_No findings._', '');
    }

    for (const adapter of adapters) {
        if (!adapter.summarize) {
            continue;
        }
        for (const t of adapter.summarize(sorted)) {
            out.push(`## ${adapter.id}: ${t.title}`, '', table(['Item', 'Count'], t.rows), '');
        }
    }

    const recheck: Cell[][] = [];
    for (const [siteId, group] of Map.groupBy(sorted, (r) => r.siteId)) {
        const codes = new Set<string>();
        for (const record of group) {
            for (const result of Object.values(record.adapters)) {
                for (const f of result.findings) {
                    if (f.severity === Severity.ERROR) {
                        codes.add(f.code);
                    }
                }
            }
        }
        if (codes.size >= recheckMinErrorCodes) {
            recheck.push([siteId, group[0]?.siteUrl ?? '', [...codes].sort().join(', ')]);
        }
    }
    out.push(`## Recheck manually (${recheckMinErrorCodes}+ error codes)`, '', recheck.length ? table(['Site ID', 'URL', 'Codes'], recheck) : '_None._', '');

    return out.join('\n');
}

export const summaryMdReporter = defineBuiltinReporter({
    id: 'summary-md',
    description: 'summary.md: counts by severity and finding code. Options: recheckMinErrorCodes (default 2).',
    engine: BUILTIN_ENGINE_RANGE,
    options: { recheckMinErrorCodes: { type: OptionType.INTEGER, default: DEFAULT_RECHECK_MIN_ERROR_CODES, min: 1, summary: 'Distinct error codes that put a site on the manual recheck list' } },
    render(records: readonly ScanRecord[], { adapters, run, options }: ReportContext): readonly ReportFile[] {
        const min = new OptionReader('summary-md', options).integer('recheckMinErrorCodes', DEFAULT_RECHECK_MIN_ERROR_CODES, 1);

        return [{ name: 'summary.md', content: buildSummaryMd(records, adapters, run, min) }];
    },
});
