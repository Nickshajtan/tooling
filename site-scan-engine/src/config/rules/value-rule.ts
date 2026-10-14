export const ValueKind = {
    POSITIVE_INTEGER: 'positive-integer',
    NON_NEGATIVE_INTEGER: 'non-negative-integer',
    NULLABLE_STRING: 'nullable-string',
    NON_EMPTY_STRING: 'non-empty-string',
    STRING_ARRAY: 'string-array',
    STRING_RECORD: 'string-record',
    ARRAY: 'array',
    ENUM: 'enum',
    ABSOLUTE_PATHS: 'absolute-paths',
} as const;

export type ValueKind = (typeof ValueKind)[keyof typeof ValueKind];

/** What a rule checks one value against. `label` is the dotted config path used in messages. */
export interface ValueSpec {
    readonly kind: ValueKind;
    readonly label: string;
    /** Allowed values, for `enum`. */
    readonly allowed?: readonly string[];
    /** Wording for the type-mismatch message of the array/string kinds. */
    readonly expects?: string;
}

/** One strategy per value kind. Returns the problems found (empty = valid). */
export interface ValueRule {
    check(value: unknown, spec: ValueSpec): readonly string[];
}
