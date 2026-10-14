# Formats

**Who this is for:** anyone who reads engine output, writes a `SiteSource` or a `Reporter`, or stores runs somewhere new.
This is the spec. A change to anything marked *versioned* means bumping `recordSchemaVersion` and following package semver.

Related: [types](types.md) · [configuration](configuration.md) · [plugins/sources](plugins/sources.md) · [plugins/reporters](plugins/reporters.md)

## Versioning

| What | Version | Where it is stored | Bumped when |
| --- | --- | --- | --- |
| Record schema | `recordSchemaVersion` (now `1`) | `run.json` | `ScanRecord` or `run.json` change shape |
| Engine | package semver (`engineVersion`) | `run.json` | every release |
| Plugin ↔ engine | each plugin's `engine` range | the plugin | the plugin author decides |

`report`, `--resume` and `--from-run` refuse a run whose `recordSchemaVersion` differs from the one the engine reads
(error code `run_schema_unsupported`). `0.x` caret ranges are pinned to the minor: `^0.2.0` means `>=0.2.0 <0.3.0`.
Only `x.y.z` and `^x.y.z` ranges are supported; anything else is a `TypeError` naming the plugin.

## `Site` (what a `SiteSource` returns)

| Field | Type | Required | Meaning | Example |
| --- | --- | --- | --- | --- |
| `siteId` | `string` | yes | Unique within a run; domain-neutral (for WordPress it is the blog id). A duplicate is a run error. | `"801"` |
| `url` | `string` | yes | Absolute URL, `URL.canParse()` must be true. | `"https://example.com/"` |
| `isPublic` | `boolean` | yes | What search engines see. | `true` |
| `isActive` | `boolean` | yes | Not archived, spam or deleted. | `true` |
| `meta` | `Record<string,string>` | yes (may be `{}`) | Extra per-site data. Keys match `^[a-z][a-z0-9_]*$`, values are strings. | `{ "blogname": "Pebble Beach" }` |

The engine validates every site a source returns. An invalid site is **dropped** with a `warning` event naming it
(`dropped site #3: url must be an absolute URL …`); it does not fail the run. Sites are frozen before plugins see them.

## Built-in `csv` source — input

A CSV with a header row. Default mapping is a `wp site list` export:
`wp site list --fields=blog_id,url,public,archived,spam,deleted --format=csv > sites.local.csv`.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `path` | string, required | — | CSV file, resolved against the config file's directory (or the working directory). |
| `columns` | object | `{ siteId: "blog_id", url: "url", public: "public", archived: "archived", spam: "spam", deleted: "deleted" }` | Maps a `Site` field or flag to a CSV header. Only `siteId` and `url` must exist in the file. |
| `meta` | string[] | `[]` | CSV headers copied into `site.meta`. The key is the header lowercased with every non-`[a-z0-9_]` character replaced by `_`. `"*"` = every column not used by `columns`. |

Flags: a missing flag column means "unknown" and the site counts as active/public. `isActive = !archived && !spam && !deleted`,
`isPublic = isActive && public`. A flag cell is true only when it is `1`.

## Built-in `url` source

`options.urls: string[]` → `siteId` is `adhoc-1…n`, `meta` is `{}`, active and public.

## `ScanRecord` — one line of `raw.jsonl` *(versioned, schema 1)*

| Field | Type | Meaning |
| --- | --- | --- |
| `siteId` | string | From `site.siteId`. |
| `siteUrl` | string | From `site.url`. Unchanged by `host-map`. |
| `path` | string | The scanned path, e.g. `/`. |
| `url` | string | `new URL(path, siteUrl).href`. Unchanged by `host-map`. |
| `isPublic`, `isActive` | boolean | From the site. |
| `meta` | `Record<string,string>` | Copied from `site.meta`, so reporters never need the source. |
| `http.status` | number | HTTP status; `0` = no response. |
| `http.finalUrl` | string | URL after redirects (as requested, so a host rewritten by `host-map` shows its real host here). |
| `http.redirects` | number | Number of redirects followed. |
| `http.timingMs`, `http.bytes` | number | Time and body size. |
| `http.error` | string | `''` on success; otherwise a fetch error code (below) or, for `other`/`middleware`, the raw message. |
| `adapters` | `Record<adapterId, AdapterResult>` | One entry per adapter, plus the reserved `engine` entry when the engine had something to say. |
| `adapters.<id>.row` | `Record<column, string\|number\|boolean>` | Values keyed by the adapter's `columns`. |
| `adapters.<id>.findings` | `Finding[]` | `{ code, severity, message, detail? }`. |
| `scannedAt` | string | ISO timestamp. |

Records are appended in **completion order**, not site order.

### Fetch error codes (`http.error`)

| Code | Meaning |
| --- | --- |
| `timeout` | The request or the whole redirect chain exceeded `http.timeoutMs`. |
| `dns` | The host did not resolve. |
| `tls` | Certificate or handshake problem. |
| `too_large` | The body exceeded `http.maxBytes`. |
| `not_html` | The page is not HTML/XML (status is kept). |
| `too_many_redirects` | More than `http.maxRedirects` redirects. |
| *(raw message)* | Any other transport failure, or a fetch middleware that threw (`<extension-id>: <message>`). |

### Engine findings (adapter id `engine`)

| Code | Severity | Detail | When |
| --- | --- | --- | --- |
| `engine.fetch_failed` | error | the error code or raw message | The page fetch ended with an error. |
| `engine.http_status` | warning | the status, e.g. `403` | The page loaded (`http.error` is empty) but the status is outside 200–299. Adapters still ran. Not a fetch failure. |
| `engine.adapter_failed` | error | the adapter id | An adapter threw. |
| `engine.middleware_failed` | error | `<extension-id>@<stage>: <message>` | A `target` or `analyze` middleware threw. |

## `run.json` *(versioned, schema 1)*

| Field | Type | Meaning |
| --- | --- | --- |
| `tool` | string | The tool name given to `runCli`. |
| `adapterIds` | string[] | Adapter ids in order; `--resume` requires the same list. |
| `engineVersion` | string | The engine that started the run. |
| `recordSchemaVersion` | number | See *Versioning*. |
| `startedAt` | string | ISO timestamp. |
| `baseDir` | string | Directory relative paths in plugin options resolve against. |
| `config` | object | The fully resolved config. `--resume` and `report` use exactly this. |

## Run storage

A *run location* is whatever the selected store understands. For the built-in `fs` store it is a directory:

```
<location>/run.json     metadata
<location>/raw.jsonl    one ScanRecord per line, appended the moment each page finishes
<location>/…            reporter output (results.csv, findings.csv, summary.md, jira/import.csv, …)
```

Contract every store implements (the shared conformance suite in `tests/store-conformance.ts` enforces it):

- `append` resolves only once the record is durable; a crash afterwards must not lose it.
- `records()` yields in append order and silently drops a partially written final record. It never throws on one.
- `create` on a location that already holds a run is an error (`run_already_exists`). Resuming is `readMeta` + `records`.
- `writeArtifact` rejects absolute paths, `..` segments, empty segments, and the names `run.json` / `raw.jsonl`.
- A store holds exactly one run; listing or searching across runs is out of scope.

`fs` specifics: `records()` reads `raw.jsonl` line by line through a stream, so a run of any size is processed in constant
memory. On resume, a truncated last line is terminated with a newline before the next record is appended.

## Built-in reporter output

All three are render-mode reporters and receive records sorted by numeric `siteId`, then `siteId` text, then `path`.

### `results.csv` (`results-csv`)

One row per site × path. Every cell is quoted.

| Column | Meaning |
| --- | --- |
| `site_id`, `url`, `path` | Identity. `url` is the site URL. |
| `is_public` | `1` / `0`. |
| `status`, `final_url`, `redirects`, `timing_ms`, `error` | From `http`. |
| `meta.<key>` | One per key in the reporter's `meta` option, after the base columns. |
| `<adapterId>.<column>` | One per adapter column, in adapter order. |

### `findings.csv` (`findings-csv`)

Columns `site_id, url, path, adapter, code, severity, message, detail`, one row per finding, `engine` included.
Option `minSeverity` (`info` default, `warning`, `error`) drops everything below it.

### `summary.md` (`summary-md`)

Counts by severity, sites per finding code per adapter (the `engine` section only when it has findings), each adapter's
`summarize()` tables, and a *Recheck manually* list: sites with at least `recheckMinErrorCodes` (default `2`) distinct
error codes.
