import type { OptionSpec } from '../../contract/options.js';

/** One strategy per OptionType. Returns the problem messages for `value` (empty = valid). */
export interface OptionRule {
    check(value: unknown, spec: OptionSpec): readonly string[];
}

export function describeValue(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
}
