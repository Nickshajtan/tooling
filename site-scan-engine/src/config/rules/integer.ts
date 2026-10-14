import type { ValueRule, ValueSpec } from './value-rule.js';

function integerRule(minimum: number, article: string): ValueRule {
    return {
        check(value: unknown, spec: ValueSpec): readonly string[] {
            if (Number.isInteger(value) && (value as number) >= minimum) {
                return [];
            }

            return [`${spec.label} must be ${article} integer (got ${JSON.stringify(value)})`];
        },
    };
}

export const positiveIntegerRule: ValueRule = integerRule(1, 'a positive');
export const nonNegativeIntegerRule: ValueRule = integerRule(0, 'a non-negative');
