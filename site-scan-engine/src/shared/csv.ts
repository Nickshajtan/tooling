/**
 * Minimal RFC 4180 CSV read/write (quoted fields, escaped quotes, CRLF/LF).
 * Kept dependency-free on purpose: inputs are `wp site list --format=csv` exports.
 */

/** Splits CSV text into rows of cells; blank rows are dropped. */
export function parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index] ?? '';

        if (inQuotes) {
            if (char === '"' && content[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && content[index + 1] === '\n') {
                index += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/**
 * Parses CSV with a header row into objects keyed by trimmed header names.
 */
export function parseCsvRecords(content: string): Record<string, string>[] {
    const [header, ...body] = parseCsv(content);
    if (!header) {
        return [];
    }

    const keys = header.map((name) => name.trim());

    return body.map((cells) => Object.fromEntries(keys.map((key, idx) => [key, (cells[idx] ?? '').trim()] as const)));
}

/** Always-quoted CSV cell; `null`/`undefined` become an empty cell. */
export function csvEscape(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);

    return `"${text.replaceAll('"', '""')}"`;
}

/** Header row plus one quoted row per object, keyed by `columns`. */
export function toCsv(columns: readonly string[], rows: readonly Readonly<Record<string, unknown>>[]): string {
    const lines = [columns.map(csvEscape).join(',')];

    for (const row of rows) {
        lines.push(columns.map((column) => csvEscape(row[column])).join(','));
    }

    return `${lines.join('\n')}\n`;
}
