export const FlagType = {
    STRING: 'string',
    INTEGER: 'integer',
    BOOLEAN: 'boolean',
    LIST: 'list',
    PATH: 'path',
    URL: 'url',
    ENUM: 'enum',
    KEYVALUE: 'keyvalue',
} as const;

export type FlagType = (typeof FlagType)[keyof typeof FlagType];

export const CommandName = {
    SCAN: 'scan',
    REPORT: 'report',
    VALIDATE: 'validate',
    PLUGINS: 'plugins',
} as const;

export type CommandName = (typeof CommandName)[keyof typeof CommandName];

export const FlagGroup = {
    TARGETS: 'Targets',
    SCANNING: 'Scanning',
    HTTP: 'HTTP',
    OUTPUT: 'Output',
    PLUGINS: 'Plugins',
    GENERAL: 'General',
} as const;

export type FlagGroup = (typeof FlagGroup)[keyof typeof FlagGroup];

/** Display order of the groups in `--help` and docs/cli.md. */
export const FLAG_GROUP_ORDER: readonly FlagGroup[] = [
    FlagGroup.TARGETS, FlagGroup.SCANNING, FlagGroup.HTTP, FlagGroup.OUTPUT, FlagGroup.PLUGINS, FlagGroup.GENERAL,
];

/** Declares one flag once: parsing, validation, `--help` and docs/cli.md are all generated from this. */
export interface FlagSpec {
    /** Long name without dashes, e.g. `concurrency`. */
    readonly name: string;
    /** Single letter, e.g. `c`. */
    readonly short?: string;
    readonly type: FlagType;
    /** Allowed values, for `enum`. */
    readonly enumValues?: readonly string[];
    readonly min?: number;
    readonly max?: number;
    readonly repeatable?: boolean;
    /** `list` flags only: an empty value is valid (e.g. `--reporters ''` = no reporters). */
    readonly allowEmpty?: boolean;
    /** Dotted config path the flag sets, e.g. `scan.concurrency`. Flags without one are handled by the command itself. */
    readonly config?: string;
    /** Commands where the flag is valid. */
    readonly commands: readonly CommandName[];
    readonly group: FlagGroup;
    /** One line for `--help`. */
    readonly summary: string;
    /** Placeholder for the value in help, e.g. `N`, `<csv>`. */
    readonly value?: string;
    readonly example?: string;
    readonly conflictsWith?: readonly string[];
    /** Flags that must also be given, e.g. `from-run` requires `code`. */
    readonly requires?: readonly string[];
    /** At least one of these flags must also be given, e.g. `from-run` needs `code` or `exclude-code`. */
    readonly requiresOneOf?: readonly string[];
}
