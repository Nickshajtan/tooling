/**
 * Loading sites: pick the source, materialize and validate what it returns, then apply the engine-owned
 * filters (`sites.filter`, then `sites.siteIds`, then `sites.limit`). Sources never filter.
 */

import type { Site } from '../contract/site.js';
import { siteFilterStrategy, type SiteFilter } from '../contract/site-filter.js';
import type { SiteSource } from '../contract/source.js';
import type { WarningSink } from '../contract/warning.js';
import { requireOptions } from '../plugins/plugin-options.js';
import { validateSite } from './validate-site.js';

export interface LoadSitesOptions {
    readonly source: SiteSource;
    /** `config.sites.options[source.id]` */
    readonly sourceOptions: unknown;
    readonly baseDir: string;
    readonly filter: SiteFilter;
    readonly siteIds: ReadonlySet<string> | undefined;
    /** Sites to drop after `siteIds`; counted in `excluded.byRun`. */
    readonly excludeSiteIds?: ReadonlySet<string> | undefined;
    /** 0 = no limit. */
    readonly limit: number;
    readonly onWarning: WarningSink;
    readonly signal?: AbortSignal;
}

export interface LoadSitesResult {
    readonly sites: readonly Site[];
    /** Valid sites the source returned, before filtering. */
    readonly loaded: number;
    /** Sites dropped because they failed validation. */
    readonly dropped: number;
    /** Valid sites `sites.filter` removed, by reason (inactive wins over private). */
    readonly excluded: { readonly inactive: number; readonly private: number; readonly byRun: number };
}

async function materialize(loaded: Promise<readonly Site[]> | AsyncIterable<Site>): Promise<unknown[]> {
    if (Symbol.asyncIterator in loaded) {
        const all: unknown[] = [];
        for await (const site of loaded) {
            all.push(site);
        }

        return all;
    }

    return [...(await loaded)];
}

export async function loadSites({
    source,
    sourceOptions,
    baseDir,
    filter,
    siteIds,
    excludeSiteIds,
    limit,
    onWarning,
    signal = new AbortController().signal,
}: LoadSitesOptions): Promise<LoadSitesResult> {
    const raw = await materialize(source.load({ options: requireOptions('source', source, sourceOptions), baseDir, signal }));

    const valid: Site[] = [];
    const seen = new Set<string>();
    let dropped = 0;
    raw.forEach((entry, index) => {
        const checked = validateSite(entry);
        if ('problems' in checked) {
            dropped += 1;
            onWarning({ source: source.id, message: `dropped site #${index + 1}: ${checked.problems.join('; ')}` });

            return;
        }
        if (seen.has(checked.site.siteId)) {
            throw new Error(`Source "${source.id}" returned duplicate siteId "${checked.site.siteId}"`);
        }
        seen.add(checked.site.siteId);
        valid.push(checked.site);
    });

    const strategy = siteFilterStrategy(filter);
    const kept = valid.filter((site) => strategy.matches(site));
    const removed = valid.filter((site) => !strategy.matches(site));
    const included = kept.filter((site) => !siteIds || siteIds.has(site.siteId));
    const selected = included.filter((site) => !excludeSiteIds?.has(site.siteId));

    const excluded = { inactive: removed.filter((site) => !site.isActive).length, private: removed.filter((site) => site.isActive).length, byRun: included.length - selected.length };

    return { sites: limit > 0 ? selected.slice(0, limit) : selected, loaded: valid.length, dropped, excluded };
}
