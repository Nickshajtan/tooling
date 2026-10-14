# Writing a `Reporter`

**Who this is for:** a tool author who needs an output format the built-ins (`results-csv`, `findings-csv`, `summary-md`) do not cover.

Related: [formats](../formats.md) · [architecture](../architecture.md) · [types](../types.md)

A reporter turns `ScanRecord`s into **files**. It does not write them: it returns `ReportFile`s (`{ name, content }`) and the
engine stores them through the run store. That keeps reporters pure and storage-agnostic, and lets `report <run>` rebuild any
output later without network access.

A reporter implements **exactly one** of two modes (`defineReporter` throws if it has both or neither):

| Mode | Method | Records arrive | Memory | Use for |
| --- | --- | --- | --- | --- |
| render | `render(records, context)` | all at once, **sorted** by numeric `siteId`, then `siteId`, then `path` | holds every record | CSV/Markdown/JSON summaries |
| streaming | `open(context)` → `{ write(record), close() }` | one by one in **completion order**, not sorted | constant | huge runs, NDJSON export |

`context` is `{ adapters, run, options }`: the adapters (for column names), `run.json`'s contents, and
`config.output.options[reporter.id]` validated against your `options` schema.

File content is a single `string | Uint8Array` held in memory once at the end. That is fine for the expected sizes (a few MB);
revisit only if a report approaches ~100 MB.

## Example: a JSON reporter (render mode)

```ts
import { defineReporter } from '@hcc/site-scan-engine';

export const jsonReporter = defineReporter({
    id: 'json',
    description: 'One JSON file with every record',
    engine: '^0.2.0',
    options: { pretty: { type: 'boolean', default: false, summary: 'Indent the output' } },
    render(records, { options }) {
        const { pretty } = options as { pretty: boolean };
        return [{ name: 'records.json', content: JSON.stringify(records, null, pretty ? 2 : 0) }];
    },
});
```

## Example: a streaming NDJSON reporter

```ts
export const ndjsonReporter = defineReporter({
    id: 'ndjson',
    description: 'One finding per line, constant memory',
    engine: '^0.2.0',
    open() {
        const lines: string[] = [];
        return {
            write(record) {
                for (const [adapterId, result] of Object.entries(record.adapters)) {
                    for (const f of result.findings) {
                        lines.push(JSON.stringify({ siteId: record.siteId, path: record.path, adapterId, ...f }));
                    }
                }
            },
            close: () => [{ name: 'findings.ndjson', content: `${lines.join('\n')}\n` }],
        };
    },
});
```

## Using it

```ts
runCli({ name: 'seo-scan', adapters: [...], reporters: [jsonReporter, ndjsonReporter] });
```

```bash
seo-scan scan --sites sites.local.csv --reporters results-csv,json
seo-scan report reports/seo-scan-20261013-142501 --reporters ndjson   # this call only; run.json is not changed
```

## What the engine enforces

- A file `name` is a relative path inside the run (`jira/import.csv` is fine). Absolute paths, `..`, empty segments and the
  names `run.json` / `raw.jsonl` are rejected, as is the same name from two reporters. The failure names the reporter.
- A reporter that throws does not stop the others. It becomes a `warning` event (printed to stderr) and the CLI exits `1` after
  the remaining reporters finish. Its files are not stored.
- `output.reporters: []` is valid: records are kept and nothing else is written.
- The `id` may not be `results-csv`, `findings-csv` or `summary-md`. To replace a built-in, leave it out of `output.reporters`
  and give yours a new id.
- Reporters never read `process.*`; everything comes from `context`.
