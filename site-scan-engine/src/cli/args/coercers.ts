import { didYouMean } from '../../shared/did-you-mean.js';
import { FlagType, type FlagSpec } from './flag-spec.js';

/** Result of coercing one raw flag value: a typed value, or the reason it is not valid. */
export type Coerced = { readonly value: unknown } | { readonly problem: string; readonly hint?: string; readonly didYouMean?: string };

/** One strategy per FlagType. */
export interface FlagCoercer {
    coerce(raw: string, spec: FlagSpec): Coerced;
}

const string: FlagCoercer = { coerce: (raw) => ({ value: raw }) };

const integer: FlagCoercer = {
    coerce(raw, { min, max }) {
        const parsed = Number(raw);
        const lowest = min ?? Number.MIN_SAFE_INTEGER;
        const highest = max ?? Number.MAX_SAFE_INTEGER;
        if (raw.trim() === '' || !Number.isInteger(parsed) || parsed < lowest || parsed > highest) {
            const range = min !== undefined && max !== undefined ? `between ${min} and ${max}` : min !== undefined ? `>= ${min}` : max !== undefined ? `<= ${max}` : '';

            return { problem: `"${raw}" is not an integer${range ? ` ${range}` : ''}`, hint: `Use a whole number${range ? ` ${range}` : ''}.` };
        }

        return { value: parsed };
    },
};

const boolean: FlagCoercer = { coerce: () => ({ value: true }) };

const list: FlagCoercer = {
    coerce(raw, { allowEmpty }) {
        const items = raw.split(',').map((item) => item.trim()).filter(Boolean);

        return items.length > 0 || allowEmpty ? { value: items } : { problem: 'the list is empty', hint: 'Give comma-separated values, e.g. a,b.' };
    },
};

const path: FlagCoercer = {
    coerce: (raw) => (raw.trim() === '' ? { problem: 'the path is empty' } : { value: raw }),
};

const url: FlagCoercer = {
    coerce: (raw) => (URL.canParse(raw) ? { value: raw } : { problem: `"${raw}" is not an absolute URL`, hint: 'Include the scheme, e.g. https://example.com/.' }),
};

const enumeration: FlagCoercer = {
    coerce(raw, { enumValues = [] }) {
        if (enumValues.includes(raw)) {
            return { value: raw };
        }
        const suggestion = didYouMean(raw, enumValues);

        return {
            problem: `"${raw}" is not one of ${enumValues.join('|')}`,
            ...(suggestion !== undefined ? { didYouMean: suggestion } : {}),
        };
    },
};

const keyvalue: FlagCoercer = {
    coerce: (raw) => (/^[^=]+=/.test(raw) ? { value: raw } : { problem: `"${raw}" must look like <key>=<value>` }),
};

/** `satisfies Record<FlagType, …>`: a new FlagType without a coercer is a compile error. */
export const COERCERS = {
    [FlagType.STRING]: string,
    [FlagType.INTEGER]: integer,
    [FlagType.BOOLEAN]: boolean,
    [FlagType.LIST]: list,
    [FlagType.PATH]: path,
    [FlagType.URL]: url,
    [FlagType.ENUM]: enumeration,
    [FlagType.KEYVALUE]: keyvalue,
} as const satisfies Record<FlagType, FlagCoercer>;
