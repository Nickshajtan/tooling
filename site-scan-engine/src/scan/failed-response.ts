import { FetchError, type FetchResponse } from '../contract/fetch.js';

/** A response standing in for "no response", with the reason in `error` / `errorDetail`. */
export function failedResponse(url: string, error: FetchError, detail: string): FetchResponse {
    return {
        requestedUrl: url,
        finalUrl: url,
        status: 0,
        redirects: [],
        headers: {},
        contentType: '',
        body: '',
        bytes: 0,
        timingMs: 0,
        error,
        errorDetail: detail,
    };
}

/**
 * The string stored in `ScanRecord.http.error` and in `engine.fetch_failed` findings: the stable code for known
 * errors, the raw message for `other` / `middleware` (so the record shape is the same as before 0.2).
 */
export function describeError(response: FetchResponse): string {
    if (response.error === '') {
        return '';
    }

    return response.error === FetchError.OTHER || response.error === FetchError.MIDDLEWARE ? response.errorDetail : response.error;
}
