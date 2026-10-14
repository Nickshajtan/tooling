# Writing a `SiteSource`

**Who this is for:** a tool author whose sites do not come from a `wp site list` CSV (a database, an API, a different file).

Related: [formats](../formats.md) · [configuration](../configuration.md) · [architecture](../architecture.md)

A source turns config into `Site[]`. That is all it does:

- **Filtering belongs to the engine.** After `load()` the engine applies `sites.filter`, then `sites.siteIds`, then `sites.limit`.
  A source returns *every* site it knows, with correct `isActive` / `isPublic`.
- The engine fully materializes the list before scanning (it needs the total for progress and for resume), so `load` may
  return a `Promise<Site[]>` or an `AsyncIterable<Site>`.
- Every site is validated; a bad one is dropped with a `warning`, a duplicate `siteId` fails the run.

```ts
interface SiteSource<O> {
    id: string; description: string; engine: string; options?: OptionSchema;
    load(context: { options: O; baseDir: string; signal: AbortSignal }): Promise<readonly Site[]> | AsyncIterable<Site>;
}
```

`options` is `config.sites.options[source.id]` only, validated against your `options` schema (defaults applied).
`baseDir` is what relative paths resolve against. `signal` aborts on Ctrl+C — pass it to your I/O.

## Worked example: a `wp site list` runner

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineSource } from '@hcc/site-scan-engine';

const run = promisify(execFile);

export const wpSource = defineSource({
    id: 'wp-cli',
    description: 'Sites straight from `wp site list` (no CSV file)',
    engine: '^0.2.0',
    options: {
        path: { type: 'string', default: '.', summary: 'WordPress root' },
        network: { type: 'boolean', default: true, summary: 'Multisite network' },
    },
    async load({ options, signal }) {
        const { path } = options as { path: string };
        const { stdout } = await run('wp', ['site', 'list', '--fields=blog_id,url,public,archived,spam,deleted,blogname', '--format=json', `--path=${path}`], { signal });
        const rows = JSON.parse(stdout) as Array<Record<string, string>>;
        return rows.map((row) => {
            const isActive = row.archived !== '1' && row.spam !== '1' && row.deleted !== '1';
            return {
                siteId: row.blog_id ?? '',
                url: row.url ?? '',
                isActive,
                isPublic: isActive && row.public === '1',
                meta: { blogname: row.blogname ?? '' },
            };
        });
    },
});
```

Wire it up and select it:

```ts
runCli({ name: 'seo-scan', adapters: [...], sources: [wpSource] });
```

```bash
seo-scan scan --source wp-cli --source-opt path=/var/www/html
```

## Rules

- `id` is kebab-case, unique among sources, and **not** `csv` or `url` (built-ins are never overridden silently).
- Don't read `process.*` or environment variables; take everything from `options`.
- `meta` keys match `^[a-z][a-z0-9_]*$` and values are strings — that is what lets reporters add `meta.<key>` columns.
- Throw a `TypeError` for bad options or missing required input (the CLI shows it as a `no_sites_selected` / `source_failed` error);
  throw anything else for I/O failure.
