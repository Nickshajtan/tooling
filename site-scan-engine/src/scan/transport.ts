/**
 * The transport: native fetch with manual redirects, a timeout and a size cap. Internal and not replaceable;
 * to mock or cache, a fetch middleware sets `context.response` and does not call `next()`.
 * Never throws: every failure is reported through `FetchResponse.error`.
 */

import { FetchError, type FetchRequest, type FetchResponse, type Redirect } from '../contract/fetch.js';
import { classifyError } from './fetch-error.js';
import { rewriteHost } from './host-rewrite.js';

export type FetchImpl = typeof fetch;

interface BodyResult {
    readonly text: string;
    readonly bytes: number;
    readonly tooLarge: boolean;
}

/** Reads at most `maxBytes` from the response body. */
async function readBody(response: Response, maxBytes: number): Promise<BodyResult> {
    if (!response.body) {
        return { text: '', bytes: 0, tooLarge: false };
    }

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
            await response.body.cancel().catch(() => {});

            return { text: '', bytes, tooLarge: true };
        }
        chunks.push(chunk);
    }

    return { text: Buffer.concat(chunks).toString('utf8'), bytes, tooLarge: false };
}

/** Mutable working copy of a FetchResponse while a request is in flight. */
type ResponseDraft = { -readonly [K in keyof FetchResponse]: FetchResponse[K] };

const HTML_TYPE = /html|xml/i;

export function isHtmlContentType(contentType: string): boolean {
    return HTML_TYPE.test(contentType);
}

export async function transport(request: FetchRequest, fetchImpl: FetchImpl = globalThis.fetch): Promise<FetchResponse> {
    const started = performance.now();
    const redirects: Redirect[] = [];
    const draft: ResponseDraft = {
        requestedUrl: request.url,
        finalUrl: request.url,
        status: 0,
        redirects,
        headers: {},
        contentType: '',
        body: '',
        bytes: 0,
        timingMs: 0,
        error: '',
        errorDetail: '',
    };

    try {
        const signal = AbortSignal.timeout(request.timeoutMs);
        let current = request.url;

        for (let hop = 0; ; hop += 1) {
            const response = await fetchImpl(current, { method: request.method, redirect: 'manual', signal, headers: { ...request.headers } });

            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                await response.body?.cancel().catch(() => {});
                redirects.push({ url: current, status: response.status });
                if (hop >= request.maxRedirects) {
                    draft.status = response.status;
                    draft.error = FetchError.TOO_MANY_REDIRECTS;
                    break;
                }
                const next = new URL(location, current).href;
                current = request.rewriteHosts ? rewriteHost(next, request.rewriteHosts) : next;
                continue;
            }

            draft.finalUrl = current;
            draft.status = response.status;
            draft.headers = Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v]));
            draft.contentType = draft.headers['content-type'] ?? '';

            if (!isHtmlContentType(draft.contentType) && !request.acceptAnyContentType) {
                await response.body?.cancel().catch(() => {});
                draft.error = FetchError.NOT_HTML;
                break;
            }

            const body = await readBody(response, request.maxBytes);
            draft.bytes = body.bytes;
            if (body.tooLarge) {
                draft.error = FetchError.TOO_LARGE;
            } else {
                draft.body = body.text;
            }
            break;
        }
    } catch (err) {
        const classified = classifyError(err);
        draft.error = classified.error;
        draft.errorDetail = classified.detail;
    }

    draft.timingMs = Math.round(performance.now() - started);

    return draft;
}
