import { defineExtension, FetchError } from '../../src/index.js';
import type { Extension, FetchRequest, FetchResponse } from '../../src/index.js';

export interface FakePage {
    readonly html?: string;
    readonly status?: number;
    readonly error?: FetchError;
    readonly errorDetail?: string;
    readonly contentType?: string;
}

export const MOCK_ID = 'mock';

export function fakeResponse(request: FetchRequest, page: FakePage | undefined): FetchResponse {
    const missing = page === undefined;
    const error = missing ? FetchError.DNS : (page.error ?? '');
    const body = page?.html ?? '';

    return {
        requestedUrl: request.url,
        finalUrl: request.url,
        status: error === '' ? (page?.status ?? 200) : 0,
        redirects: [],
        headers: {},
        contentType: page?.contentType ?? 'text/html',
        body,
        bytes: body.length,
        timingMs: 5,
        error,
        errorDetail: missing ? 'ENOTFOUND' : (page.errorDetail ?? ''),
    };
}

/**
 * Test replacement for the network: a fetch middleware that answers from a url → page map and never calls next().
 * Unknown URLs answer as a DNS failure. Not a built-in; list it in `scan.extensions` to activate it.
 */
export function mockExtension(pages: Readonly<Record<string, FakePage>>, seen: string[] = []): Extension {
    return defineExtension({
        id: MOCK_ID,
        description: 'Test: answers fetches from a map',
        engine: '^0.2.0',
        setup(api) {
            api.use('fetch', async (context) => {
                seen.push(context.request.url);
                context.response = fakeResponse(context.request, pages[context.request.url]);
            });
        },
    });
}
