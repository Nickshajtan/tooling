/**
 * Declarative per-plugin option schema: a small table, not JSON Schema. The engine validates a plugin's options
 * against it (unknown keys, types, ranges, with "did you mean"), applies the defaults, and passes the result to the
 * plugin as `options`. Plugins without a schema get their options unchecked.
 */

export const OptionType = {
    STRING: 'string',
    INTEGER: 'integer',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    STRING_ARRAY: 'string[]',
    /** An object whose values are all strings. */
    RECORD: 'record',
} as const;

export type OptionType = (typeof OptionType)[keyof typeof OptionType];

export interface OptionSpec {
    readonly type: OptionType;
    readonly default?: unknown;
    readonly min?: number;
    readonly max?: number;
    /** Allowed values; for `string[]` every item must be one of them. */
    readonly enumValues?: readonly string[];
    readonly required?: boolean;
    /** One line for `plugins` and `--help`. */
    readonly summary: string;
}

export type OptionSchema = Readonly<Record<string, OptionSpec>>;

/** One problem with a plugin's options. `key` is the option name, `null` for problems with the bag itself. */
export interface OptionProblem {
    readonly key: string | null;
    readonly what: string;
    readonly didYouMean?: string;
}
