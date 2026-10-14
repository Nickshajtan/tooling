import type { Adapter } from '../../contract/adapter.js';
import { OptionType } from '../../contract/options.js';
import { defineBuiltinReporter, type ReportContext, type ReportFile } from '../../contract/reporter.js';
import type { ScanRecord } from '../../contract/record.js';
import { toCsv } from '../../shared/csv.js';
import { OptionReader } from '../../shared/option-reader.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { sortRecords } from '../sort.js';

const BASE_COLUMNS = ['site_id', 'url', 'path', 'is_public', 'status', 'final_url', 'redirects', 'timing_ms', 'error'];

/** One row per site × path; `site.meta` keys listed in `metaKeys` follow the base columns as `meta.<key>`, adapter columns as `<id>.<column>`. */
export function buildResultsCsv(records: readonly ScanRecord[], adapters: readonly Adapter[], metaKeys: readonly string[] = []): string {
    const metaColumns = metaKeys.map((key) => `meta.${key}`);
    const adapterColumns = adapters.flatMap((adapter) => adapter.columns.map((column) => `${adapter.id}.${column}`));
    const rows = sortRecords(records).map((record) => {
        const row: Record<string, unknown> = {
            site_id: record.siteId,
            url: record.siteUrl,
            path: record.path,
            is_public: record.isPublic ? 1 : 0,
            status: record.http.status,
            final_url: record.http.finalUrl,
            redirects: record.http.redirects,
            timing_ms: record.http.timingMs,
            error: record.http.error,
        };
        for (const key of metaKeys) {
            row[`meta.${key}`] = record.meta[key] ?? '';
        }
        for (const adapter of adapters) {
            for (const column of adapter.columns) {
                row[`${adapter.id}.${column}`] = record.adapters[adapter.id]?.row?.[column];
            }
        }

        return row;
    });

    return toCsv([...BASE_COLUMNS, ...metaColumns, ...adapterColumns], rows);
}

export const resultsCsvReporter = defineBuiltinReporter({
    id: 'results-csv',
    description: 'results.csv: one row per site × path. Options: meta (site.meta keys to add as meta.<key> columns).',
    engine: BUILTIN_ENGINE_RANGE,
    options: { meta: { type: OptionType.STRING_ARRAY, default: [], summary: 'site.meta keys to add as meta.<key> columns after the base columns' } },
    render(records: readonly ScanRecord[], { adapters, options }: ReportContext): readonly ReportFile[] {
        const metaKeys = new OptionReader('results-csv', options).stringArray('meta', []);

        return [{ name: 'results.csv', content: buildResultsCsv(records, adapters, metaKeys) }];
    },
});
