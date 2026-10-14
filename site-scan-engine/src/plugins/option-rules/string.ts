import { describeValue, type OptionRule } from './option-rule.js';

export const stringOption: OptionRule = {
    check(value, spec) {
        if (typeof value !== 'string') {
            return [`must be a string (got ${describeValue(value)})`];
        }
        if (spec.enumValues && !spec.enumValues.includes(value)) {
            return [`must be one of ${spec.enumValues.join('|')} (got ${describeValue(value)})`];
        }

        return [];
    },
};
