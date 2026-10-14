import { SiteFilter } from '../contract/site-filter.js';
import { deepFreeze } from '../shared/deep-freeze.js';
import type { ScanConfig } from './types.js';

/** The single source of default values. */
export const DEFAULTS: Readonly<ScanConfig> = deepFreeze({
    sites: { source: 'csv', options: {}, filter: SiteFilter.ACTIVE, siteIds: [], limit: 0 },
    scan: { paths: ['/'], concurrency: 3, delayMs: 300, extensions: ['retry'], options: {} },
    http: {
        timeoutMs: 15000,
        maxBytes: 5 * 1024 * 1024,
        maxRedirects: 10,
        userAgent: 'cet-site-scan-engine/0.2',
        headers: {
            'cache-control': 'no-cache',
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
    },
    output: { dir: './reports', store: 'fs', reporters: ['results-csv', 'findings-csv', 'summary-md'], options: {} },
    failOn: null,
    adapters: {},
});
