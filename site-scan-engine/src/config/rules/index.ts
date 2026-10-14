import { enumRule } from './enum.js';
import { nonNegativeIntegerRule, positiveIntegerRule } from './integer.js';
import { absolutePathsRule, arrayRule, nonEmptyStringRule, nullableStringRule, stringArrayRule, stringRecordRule } from './strings.js';
import { ValueKind, type ValueRule, type ValueSpec } from './value-rule.js';

/** `satisfies Record<ValueKind, …>`: adding a kind without a rule is a compile error. */
const RULES = {
    [ValueKind.POSITIVE_INTEGER]: positiveIntegerRule,
    [ValueKind.NON_NEGATIVE_INTEGER]: nonNegativeIntegerRule,
    [ValueKind.NULLABLE_STRING]: nullableStringRule,
    [ValueKind.NON_EMPTY_STRING]: nonEmptyStringRule,
    [ValueKind.STRING_ARRAY]: stringArrayRule,
    [ValueKind.STRING_RECORD]: stringRecordRule,
    [ValueKind.ARRAY]: arrayRule,
    [ValueKind.ENUM]: enumRule,
    [ValueKind.ABSOLUTE_PATHS]: absolutePathsRule,
} as const satisfies Record<ValueKind, ValueRule>;

export function checkValue(value: unknown, spec: ValueSpec): readonly string[] {
    return RULES[spec.kind].check(value, spec);
}

export { ValueKind, type ValueSpec } from './value-rule.js';
