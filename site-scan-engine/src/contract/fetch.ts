/** Types for one HTTP request through the fetch stage. See docs/types.md. */

export const FetchError = {
    TIMEOUT: 'timeout',
    DNS: 'dns',
    TLS: 'tls',
    TOO_LARGE: 'too_large',
    NOT_HTML: 'not_html',
    TOO_MANY_REDIRECTS: 'too_many_redirects',
    /** Any other transport failure; the raw message is in `errorDetail`. */
    OTHER: 'other',
    /** A fetch middleware threw; `errorDetail` is `<extension-id>: <message>`. */
    MIDDLEWARE: 'middleware',
} as const;

export type FetchError = (typeof FetchError)[keyof typeof FetchError];

export const FetchPurpose = {
    /** The page the target points at. */
    PAGE: 'page',
    /** A request an adapter or extension made through `context.fetch()` (robots.txt, sitemaps…). */
    SIDE: 'side',
} as const;

export type FetchPurpose = (typeof FetchPurpose)[keyof typeof FetchPurpose];

export interface Redirect {
    readonly url: string;
    readonly status: number;
}

export interface FetchRequest {
    readonly url: string;
    readonly method: 'GET' | 'HEAD';
    /** Lowercased names. Defaults come from `config.http.headers` plus `user-agent`. */
    readonly headers: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
    readonly maxBytes: number;
    readonly maxRedirects: number;
    /** False for pages; side requests choose. */
    readonly acceptAnyContentType: boolean;
    /** Host → replacement host, applied by the transport to every redirect `Location` (set by `host-map`). */
    readonly rewriteHosts?: Readonly<Record<string, string>> | undefined;
}

/** What adapters and extensions pass to `context.fetch()`. */
export interface SideRequest {
    /** Absolute, or relative to `target.url`. */
    readonly url: string;
    readonly method?: 'GET' | 'HEAD';
    /** Merged over the defaults. */
    readonly headers?: Readonly<Record<string, string>>;
    /** Default true for side requests. */
    readonly acceptAnyContentType?: boolean;
}

export interface FetchResponse {
    readonly requestedUrl: string;
    readonly finalUrl: string;
    /** 0 = no response. */
    readonly status: number;
    readonly redirects: readonly Redirect[];
    /** Lowercased names. */
    readonly headers: Readonly<Record<string, string>>;
    readonly contentType: string;
    /** '' on error or a non-accepted content type. */
    readonly body: string;
    readonly bytes: number;
    readonly timingMs: number;
    /** '' when the request succeeded (any HTTP status). */
    readonly error: FetchError | '';
    /** Raw message when `error` is set. */
    readonly errorDetail: string;
}
