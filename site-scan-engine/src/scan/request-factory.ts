import type { HttpConfig } from '../config/types.js';
import type { FetchRequest, SideRequest } from '../contract/fetch.js';

/** Builds FetchRequests from config. `user-agent` always wins over `http.headers`. */
export class RequestFactory {
    constructor(private readonly http: HttpConfig) {}

    private defaults(): Record<string, string> {
        return { ...this.http.headers, 'user-agent': this.http.userAgent };
    }

    page(url: string): FetchRequest {
        return {
            url,
            method: 'GET',
            headers: this.defaults(),
            timeoutMs: this.http.timeoutMs,
            maxBytes: this.http.maxBytes,
            maxRedirects: this.http.maxRedirects,
            acceptAnyContentType: false,
        };
    }

    /** `request.url` may be relative to the target URL. Header names are lowercased and merged over the defaults. */
    side(request: SideRequest, targetUrl: string): FetchRequest {
        const headers = this.defaults();
        for (const [name, value] of Object.entries(request.headers ?? {})) {
            headers[name.toLowerCase()] = value;
        }

        return {
            url: new URL(request.url, targetUrl).href,
            method: request.method ?? 'GET',
            headers,
            timeoutMs: this.http.timeoutMs,
            maxBytes: this.http.maxBytes,
            maxRedirects: this.http.maxRedirects,
            acceptAnyContentType: request.acceptAnyContentType ?? true,
        };
    }
}
