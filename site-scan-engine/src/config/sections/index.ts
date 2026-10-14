import { Severity } from '../../contract/severity.js';
import { SiteFilter } from '../../contract/site-filter.js';
import { isRecord } from '../../shared/is-record.js';
import { checkValue, ValueKind } from '../rules/index.js';
import type { ScanConfig } from '../types.js';
import type { SectionValidator } from './section-validator.js';

/** "unknown id" problem with the list of known ids, or none when the id is known / the known set is not given. */
function unknownIdProblems(label: string, ids: readonly string[], known: readonly string[] | undefined, noun: string): string[] {
    if (!known) {
        return [];
    }

    return ids.filter((id) => !known.includes(id)).map((id) => `${label}: no such ${noun} "${id}" (known: ${known.join(', ')})`);
}

const sitesValidator: SectionValidator<'sites'> = {
    validate: (sites, { sourceIds }) => [
        ...checkValue(sites.source, { kind: ValueKind.NON_EMPTY_STRING, label: 'sites.source' }),
        ...(typeof sites.source === 'string' ? unknownIdProblems('sites.source', [sites.source], sourceIds, 'source') : []),
        ...(isRecord(sites.options)
            ? unknownIdProblems('sites.options', Object.keys(sites.options), sourceIds, 'source')
            : ['sites.options must be an object keyed by source id']),
        ...checkValue(sites.filter, { kind: ValueKind.ENUM, label: 'sites.filter', allowed: Object.values(SiteFilter) }),
        ...checkValue(sites.siteIds, { kind: ValueKind.STRING_ARRAY, label: 'sites.siteIds', expects: 'an array of strings' }),
        ...checkValue(sites.limit, { kind: ValueKind.NON_NEGATIVE_INTEGER, label: 'sites.limit' }),
    ],
};

const scanValidator: SectionValidator<'scan'> = {
    validate(scan, { extensionIds }) {
        const extensions = checkValue(scan.extensions, { kind: ValueKind.STRING_ARRAY, label: 'scan.extensions', expects: 'an array of extension ids' });

        return [
            ...checkValue(scan.paths, { kind: ValueKind.ABSOLUTE_PATHS, label: 'scan.paths' }),
            ...checkValue(scan.concurrency, { kind: ValueKind.POSITIVE_INTEGER, label: 'scan.concurrency' }),
            ...checkValue(scan.delayMs, { kind: ValueKind.NON_NEGATIVE_INTEGER, label: 'scan.delayMs' }),
            ...extensions,
            ...(extensions.length === 0 ? unknownIdProblems('scan.extensions', scan.extensions, extensionIds, 'extension') : []),
            ...(isRecord(scan.options)
                ? unknownIdProblems('scan.options', Object.keys(scan.options), extensionIds, 'extension')
                : ['scan.options must be an object keyed by extension id']),
        ];
    },
};

const httpValidator: SectionValidator<'http'> = {
    validate(http) {
        const headers = checkValue(http.headers, { kind: ValueKind.STRING_RECORD, label: 'http.headers' });
        const userAgentInHeaders = headers.length === 0 && Object.keys(http.headers).some((name) => name.toLowerCase() === 'user-agent');

        return [
            ...checkValue(http.timeoutMs, { kind: ValueKind.POSITIVE_INTEGER, label: 'http.timeoutMs' }),
            ...checkValue(http.maxBytes, { kind: ValueKind.POSITIVE_INTEGER, label: 'http.maxBytes' }),
            ...checkValue(http.maxRedirects, { kind: ValueKind.NON_NEGATIVE_INTEGER, label: 'http.maxRedirects' }),
            ...checkValue(http.userAgent, { kind: ValueKind.NON_EMPTY_STRING, label: 'http.userAgent' }),
            ...headers,
            ...(userAgentInHeaders ? ['http.headers must not set user-agent; use http.userAgent'] : []),
        ];
    },
};

const outputValidator: SectionValidator<'output'> = {
    validate(output, { reporterIds, storeIds }) {
        const reporters = checkValue(output.reporters, { kind: ValueKind.STRING_ARRAY, label: 'output.reporters', expects: 'an array of reporter ids' });

        return [
            ...checkValue(output.dir, { kind: ValueKind.NON_EMPTY_STRING, label: 'output.dir' }),
            ...checkValue(output.store, { kind: ValueKind.NON_EMPTY_STRING, label: 'output.store' }),
            ...(typeof output.store === 'string' ? unknownIdProblems('output.store', [output.store], storeIds, 'store') : []),
            ...reporters,
            ...(reporters.length === 0 ? unknownIdProblems('output.reporters', output.reporters, reporterIds, 'reporter') : []),
            ...(isRecord(output.options)
                ? unknownIdProblems('output.options', Object.keys(output.options), reporterIds, 'reporter')
                : ['output.options must be an object keyed by reporter id']),
        ];
    },
};

const failOnValidator: SectionValidator<'failOn'> = {
    validate: (failOn) => (failOn === null || failOn === Severity.ERROR || failOn === Severity.WARNING
        ? []
        : ['failOn must be "error", "warning" or null']),
};

const adaptersValidator: SectionValidator<'adapters'> = {
    validate(adapters, { adapterIds }) {
        if (!isRecord(adapters)) {
            return ['adapters must be an object keyed by adapter id'];
        }
        if (!adapterIds) {
            return [];
        }

        return Object.keys(adapters)
            .filter((id) => !adapterIds.includes(id))
            .map((id) => `adapters.${id}: no such adapter in this tool (known: ${adapterIds.join(', ')})`);
    },
};

/** One validator per top-level section, in report order. A missing section is a compile error. */
export const SECTION_VALIDATORS = {
    sites: sitesValidator,
    scan: scanValidator,
    http: httpValidator,
    output: outputValidator,
    failOn: failOnValidator,
    adapters: adaptersValidator,
} as const satisfies { readonly [K in keyof ScanConfig]: SectionValidator<K> };
