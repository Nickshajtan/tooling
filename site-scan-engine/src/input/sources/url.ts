import type { Site } from '../../contract/site.js';
import { OptionType } from '../../contract/options.js';
import { defineBuiltinSource, type SourceContext } from '../../contract/source.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { OptionReader } from '../../shared/option-reader.js';

/** Ad-hoc targets (`--url`): siteId `adhoc-1…n`, empty meta. */
export function sitesFromUrls(urls: readonly string[]): Site[] {
    return urls.map((url, index) => {
        if (!URL.canParse(url)) {
            throw new Error(`Invalid --url: ${url}`);
        }

        return { siteId: `adhoc-${index + 1}`, url, isActive: true, isPublic: true, meta: {} };
    });
}

export const urlSource = defineBuiltinSource({
    id: 'url',
    description: 'Ad-hoc URLs, no file needed. Options: urls.',
    engine: BUILTIN_ENGINE_RANGE,
    options: { urls: { type: OptionType.STRING_ARRAY, required: true, summary: 'Absolute URLs to scan' } },
    async load({ options }: SourceContext): Promise<readonly Site[]> {
        const urls = new OptionReader('url', options).stringArray('urls', []);
        if (urls.length === 0) {
            throw new TypeError('No targets: url source needs sites.options.url.urls (--url <u>)');
        }

        return sitesFromUrls(urls);
    },
});
