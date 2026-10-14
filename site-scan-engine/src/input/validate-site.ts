import type { Site } from '../contract/site.js';
import { isRecord } from '../shared/is-record.js';

const META_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export type SiteValidation = { readonly site: Site } | { readonly problems: readonly string[] };

/** Checks one value returned by a SiteSource. A bad site is dropped (with a warning), it does not fail the run. */
export function validateSite(raw: unknown): SiteValidation {
    if (!isRecord(raw)) {
        return { problems: ['site must be an object'] };
    }
    const problems: string[] = [];
    const { siteId, url, isPublic, isActive, meta } = raw;

    if (typeof siteId !== 'string' || siteId === '') {
        problems.push('siteId must be a non-empty string');
    }
    if (typeof url !== 'string' || !URL.canParse(url)) {
        problems.push(`url must be an absolute URL (got ${JSON.stringify(url)})`);
    }
    if (typeof isPublic !== 'boolean') {
        problems.push('isPublic must be a boolean');
    }
    if (typeof isActive !== 'boolean') {
        problems.push('isActive must be a boolean');
    }
    const metaCopy: Record<string, string> = {};
    if (!isRecord(meta)) {
        problems.push('meta must be an object');
    } else {
        for (const [key, value] of Object.entries(meta)) {
            if (!META_KEY_PATTERN.test(key)) {
                problems.push(`meta key "${key}" must match ${META_KEY_PATTERN.source}`);
            }
            if (typeof value === 'string') {
                metaCopy[key] = value;
            } else {
                problems.push(`meta.${key} must be a string`);
            }
        }
    }
    if (
        problems.length > 0
        || typeof siteId !== 'string'
        || typeof url !== 'string'
        || typeof isPublic !== 'boolean'
        || typeof isActive !== 'boolean'
    ) {
        return { problems };
    }

    return { site: Object.freeze({ siteId, url, isPublic, isActive, meta: Object.freeze(metaCopy) }) };
}
