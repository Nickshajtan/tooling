import type { Site } from './site.js';

export const SiteFilter = {
    /** Every row in the file. */
    ALL: 'all',
    /** Not archived, spam or deleted (default). */
    ACTIVE: 'active',
    /** Active and public=1 (what search engines see). */
    PUBLIC: 'public',
} as const;

export type SiteFilter = (typeof SiteFilter)[keyof typeof SiteFilter];

export interface SiteFilterStrategy {
    matches(site: Site): boolean;
}

/** One strategy per filter; `satisfies` makes a missing filter a compile error. */
const STRATEGIES = {
    [SiteFilter.ALL]: { matches: () => true },
    [SiteFilter.ACTIVE]: { matches: (site) => site.isActive },
    [SiteFilter.PUBLIC]: { matches: (site) => site.isPublic },
} as const satisfies Record<SiteFilter, SiteFilterStrategy>;

export function siteFilterStrategy(filter: SiteFilter): SiteFilterStrategy {
    return STRATEGIES[filter];
}

export function isSiteFilter(value: unknown): value is SiteFilter {
    return typeof value === 'string' && Object.values(SiteFilter).some((known) => known === value);
}
