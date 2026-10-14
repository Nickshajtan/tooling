/** One scan target root, as returned by a SiteSource. Frozen by the engine before plugins see it. */
export interface Site {
    /** Unique within a run. Domain-neutral (for WordPress sites this is the blog id). */
    readonly siteId: string;
    /** Absolute URL, `URL.canParse()` is true. */
    readonly url: string;
    readonly isPublic: boolean;
    readonly isActive: boolean;
    /** Extra per-site data (site name, theme, region…). Keys match `^[a-z][a-z0-9_]*$`, values are strings. */
    readonly meta: Readonly<Record<string, string>>;
}
