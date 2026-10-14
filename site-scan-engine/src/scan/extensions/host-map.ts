import { defineBuiltinExtension } from '../../contract/extension.js';
import { OptionType } from '../../contract/options.js';
import { OptionReader } from '../../shared/option-reader.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';
import { rewriteHost } from '../host-rewrite.js';

/**
 * Rewrites the request host (and, via `rewriteHosts`, the host of every redirect `Location`) by a map, e.g.
 * `{ "www.example.com": "staging.example.com" }`. `target.url` and `siteId` are unchanged, so a production run and a
 * staging run can be diffed record by record. Keys match `URL.host` (a port is part of the key).
 */
export const hostMapExtension = defineBuiltinExtension({
    id: 'host-map',
    description: 'Rewrites request and redirect hosts (e.g. prod → staging). Options: map.',
    engine: BUILTIN_ENGINE_RANGE,
    options: { map: { type: OptionType.RECORD, required: true, summary: 'Host → replacement host, e.g. www.example.com → staging.example.com' } },
    setup(api) {
        const map = new OptionReader('host-map', api.options).stringRecord('map', {});

        api.use('fetch', async (context, next) => {
            const url = rewriteHost(context.request.url, map);
            context.request = { ...context.request, url, rewriteHosts: map };
            await next();
        });
    },
});
