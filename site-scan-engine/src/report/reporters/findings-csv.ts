import { OptionType } from '../../contract/options.js';
import { defineBuiltinReporter, type ReportContext, type ReportFile } from '../../contract/reporter.js';
import type { ScanRecord } from '../../contract/record.js';
import { Severity } from '../../contract/severity.js';
import { toCsv } from '../../shared/csv.js';
import { OptionReader } from '../../shared/option-reader.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { sortRecords } from '../sort.js';

export const FINDINGS_COLUMNS = ['site_id', 'url', 'path', 'adapter', 'code', 'severity', 'message', 'detail'] as const;

/** Higher = more severe. `satisfies` makes a new Severity without a rank a compile error. */
const SEVERITY_RANK = {
    [Severity.INFO]: 0,
    [Severity.WARNING]: 1,
    [Severity.ERROR]: 2,
} as const satisfies Record<Severity, number>;

/** Long-format findings, including the reserved `engine` entry. Only findings at/above `minSeverity` are listed. */
export function buildFindingsCsv(records: readonly ScanRecord[], minSeverity: Severity = Severity.INFO): string {
    const rows: Record<string, unknown>[] = [];
    for (const record of sortRecords(records)) {
        for (const adapterId of Object.keys(record.adapters).sort()) {
            for (const f of record.adapters[adapterId]?.findings ?? []) {
                if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[minSeverity]) {
                    continue;
                }
                rows.push({
                    site_id: record.siteId,
                    url: record.siteUrl,
                    path: record.path,
                    adapter: adapterId,
                    code: f.code,
                    severity: f.severity,
                    message: f.message,
                    detail: f.detail ?? '',
                });
            }
        }
    }

    return toCsv(FINDINGS_COLUMNS, rows);
}

export const findingsCsvReporter = defineBuiltinReporter({
    id: 'findings-csv',
    description: 'findings.csv: one row per finding. Options: minSeverity (info|warning|error, default info).',
    engine: BUILTIN_ENGINE_RANGE,
    options: { minSeverity: { type: OptionType.STRING, default: Severity.INFO, enumValues: Object.values(Severity), summary: 'Lowest severity to list' } },
    render(records: readonly ScanRecord[], { options }: ReportContext): readonly ReportFile[] {
        const minSeverity = new OptionReader('findings-csv', options).enumValue('minSeverity', Object.values(Severity), Severity.INFO);

        return [{ name: 'findings.csv', content: buildFindingsCsv(records, minSeverity) }];
    },
});
