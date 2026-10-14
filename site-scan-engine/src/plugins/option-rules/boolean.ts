import { describeValue, type OptionRule } from './option-rule.js';

export const booleanOption: OptionRule = {
    check: (value) => (typeof value === 'boolean' ? [] : [`must be true or false (got ${describeValue(value)})`]),
};
