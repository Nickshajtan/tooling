import type { RunStore } from '../contract/store.js';

/**
 * siteIds that had at least one finding with any of `codes` in another run (`engine.*` codes included).
 * Streams the run's records, so it works for runs of any size.
 */
export async function siteIdsWithCodes(store: RunStore, codes: readonly string[]): Promise<Set<string>> {
    return (await siteIdsByCodeSets(store, codes, [])).included;
}

/** One pass over a run: sites with any of `codes`, and sites with any of `excludeCodes`. */
export async function siteIdsByCodeSets(
    store: RunStore,
    codes: readonly string[],
    excludeCodes: readonly string[],
): Promise<{ included: Set<string>; excluded: Set<string> }> {
    const wanted = new Set(codes);
    const unwanted = new Set(excludeCodes);
    const included = new Set<string>();
    const excluded = new Set<string>();

    for await (const record of store.records()) {
        const findings = Object.values(record.adapters).flatMap((result) => result.findings);
        if (findings.some((f) => wanted.has(f.code))) {
            included.add(record.siteId);
        }
        if (findings.some((f) => unwanted.has(f.code))) {
            excluded.add(record.siteId);
        }
    }

    return { included, excluded };
}
