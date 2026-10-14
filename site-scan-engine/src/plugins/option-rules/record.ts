import { isRecord } from '../../shared/is-record.js';
import { describeValue, type OptionRule } from './option-rule.js';

export const recordOption: OptionRule = {
    check(value) {
        const valid = isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

        return valid ? [] : [`must be an object of strings (got ${describeValue(value)})`];
    },
};
