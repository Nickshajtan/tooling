import type { ValueRule, ValueSpec } from './value-rule.js';

export const enumRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        const allowed = spec.allowed ?? [];

        return typeof value === 'string' && allowed.includes(value) ? [] : [`${spec.label} must be one of ${allowed.join('|')}`];
    },
};
