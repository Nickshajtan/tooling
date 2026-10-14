/**
 * Built-in `csv` source: a CSV with a header row, by default a `wp site list` export
 * (blog_id,url[,public,archived,spam,deleted]). Column names are mappable; extra columns can be copied to `site.meta`.
 * Generate with: wp site list --fields=blog_id,url,public,archived,spam,deleted --format=csv > sites.csv
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Site } from '../../contract/site.js';
import { OptionType, type OptionSchema } from '../../contract/options.js';
import { defineBuiltinSource, type SourceContext } from '../../contract/source.js';
import { parseCsvRecords } from '../../shared/csv.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { OptionReader } from '../../shared/option-reader.js';

export interface CsvColumns {
    readonly siteId: string;
    readonly url: string;
    readonly public: string;
    readonly archived: string;
    readonly spam: string;
    readonly deleted: string;
}

export const DEFAULT_CSV_COLUMNS: CsvColumns = {
    siteId: 'blog_id',
    url: 'url',
    public: 'public',
    archived: 'archived',
    spam: 'spam',
    deleted: 'deleted',
};

const COLUMN_KEYS: readonly string[] = Object.keys(DEFAULT_CSV_COLUMNS);
const ALL_COLUMNS_MARKER = '*';

export function metaKeyFromHeader(header: string): string {
    return header.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
}

function readColumns(reader: OptionReader): CsvColumns {
    const mapped = reader.stringRecord('columns', {});
    for (const key of Object.keys(mapped)) {
        if (!COLUMN_KEYS.includes(key)) {
            throw new TypeError(`csv: option "columns" has unknown key "${key}" (known: ${COLUMN_KEYS.join(', ')})`);
        }
    }

    return { ...DEFAULT_CSV_COLUMNS, ...mapped };
}

/** Missing flag columns mean "unknown" — treat as active/public rather than silently dropping the site. */
function flag(record: Readonly<Record<string, string>>, column: string, fallback: boolean): boolean {
    const value = record[column];

    return value === undefined || value === '' ? fallback : value === '1';
}

export function sitesFromCsv(content: string, columns: CsvColumns, metaColumns: readonly string[]): Site[] {
    const records = parseCsvRecords(content);
    const first = records[0];
    if (first && !(columns.siteId in first && columns.url in first)) {
        throw new Error(`Sites CSV must have "${columns.siteId}" and "${columns.url}" columns.`);
    }

    const used = new Set<string>(Object.values(columns));
    const headers = first ? Object.keys(first) : [];
    const copied = metaColumns.includes(ALL_COLUMNS_MARKER) ? headers.filter((header) => !used.has(header)) : metaColumns;

    return records.map((record) => {
        const isActive = !flag(record, columns.archived, false) && !flag(record, columns.spam, false) && !flag(record, columns.deleted, false);
        const meta: Record<string, string> = {};
        for (const header of copied) {
            meta[metaKeyFromHeader(header)] = record[header] ?? '';
        }

        return {
            siteId: record[columns.siteId] ?? '',
            url: record[columns.url] ?? '',
            isActive,
            isPublic: isActive && flag(record, columns.public, true),
            meta,
        };
    });
}

const CSV_OPTIONS: OptionSchema = {
    path: { type: OptionType.STRING, required: true, summary: 'CSV file, resolved against the config file directory (or cwd)' },
    columns: { type: OptionType.RECORD, default: {}, summary: 'Maps siteId|url|public|archived|spam|deleted to CSV headers' },
    meta: { type: OptionType.STRING_ARRAY, default: [], summary: 'CSV headers copied into site.meta; "*" = every column not used by `columns`' },
};

export const csvSource = defineBuiltinSource({
    id: 'csv',
    description: 'Sites from a CSV file (default: wp site list export). Options: path, columns, meta.',
    engine: BUILTIN_ENGINE_RANGE,
    options: CSV_OPTIONS,
    async load({ options, baseDir }: SourceContext): Promise<readonly Site[]> {
        const reader = new OptionReader('csv', options);
        const path = reader.string('path');
        if (path === undefined || path === '') {
            throw new TypeError('No targets: csv source needs sites.options.csv.path (--sites <csv>) or use --url');
        }

        return sitesFromCsv(readFileSync(resolve(baseDir, path), 'utf8'), readColumns(reader), reader.stringArray('meta', []));
    },
});
