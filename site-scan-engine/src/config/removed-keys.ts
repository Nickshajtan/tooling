/** Config keys removed or moved in 0.2, with the replacement to show the user. */
export const REMOVED_KEYS: Readonly<Record<string, string>> = {
    'sites.csv': 'use sites.source="csv" + sites.options.csv.path',
    'sites.urls': 'use sites.source="url" + sites.options.url.urls',
    'sites.blogIds': 'use sites.siteIds',
    paths: 'moved to scan.paths',
    'http.concurrency': 'moved to scan.concurrency',
    'http.delayMs': 'moved to scan.delayMs',
};
