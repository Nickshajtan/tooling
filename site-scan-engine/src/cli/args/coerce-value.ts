/** Turns one raw `--opt` / `--source-opt` string into a typed value, or `undefined` when it is not this coercer's kind. */
export interface ValueCoercer {
    coerce(raw: string): string | number | boolean | undefined;
}

const booleans: ValueCoercer = {
    coerce: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
};

const numbers: ValueCoercer = {
    coerce: (raw) => (raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined),
};

/** First coercer that recognises the value wins; anything else stays a string. */
const COERCERS: readonly ValueCoercer[] = [booleans, numbers];

export function coerce(raw: string): string | number | boolean {
    for (const coercer of COERCERS) {
        const result = coercer.coerce(raw);
        if (result !== undefined) {
            return result;
        }
    }

    return raw;
}
