import { describeValue, type OptionRule } from './option-rule.js';

export const stringArrayOption: OptionRule = {
    check(value, spec) {
        if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
            return [`must be an array of strings (got ${describeValue(value)})`];
        }
        const allowed = spec.enumValues;
        if (!allowed) {
            return [];
        }

        return value.filter((item) => !allowed.includes(item)).map((item) => `has unknown value ${describeValue(item)} (known: ${allowed.join(', ')})`);
    },
};
