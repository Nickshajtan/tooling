import type { Site } from './site.js';

/** Identity of one unit of work (site × path). Immutable. */
export interface ScanTarget {
    readonly site: Site;
    readonly path: string;
    /** `new URL(path, site.url).href` */
    readonly url: string;
    /** `targetKey(siteId, path)`; used for resume. */
    readonly key: string;
}

/**
 * Per-page bag that extensions write (in `analyze` middleware) and adapters read. Open on purpose: tools add
 * their own keys through declaration merging, e.g.
 *
 *   declare module '@cet/site-scan-engine' { interface TargetState { browserPage?: Page } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extension point, see above
export interface TargetState {}
