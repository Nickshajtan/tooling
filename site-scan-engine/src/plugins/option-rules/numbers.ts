import type { OptionSpec } from '../../contract/options.js';
import { describeValue, type OptionRule } from './option-rule.js';

function rangeProblem(value: number, { min, max }: OptionSpec): string | null {
    if (min !== undefined && value < min) {
        return `must be >= ${min} (got ${value})`;
    }
    if (max !== undefined && value > max) {
        return `must be <= ${max} (got ${value})`;
    }

    return null;
}

export const integerOption: OptionRule = {
    check(value, spec) {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            return [`must be an integer (got ${describeValue(value)})`];
        }
        const range = rangeProblem(value, spec);

        return range === null ? [] : [range];
    },
};

export const numberOption: OptionRule = {
    check(value, spec) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return [`must be a number (got ${describeValue(value)})`];
        }
        const range = rangeProblem(value, spec);

        return range === null ? [] : [range];
    },
};
