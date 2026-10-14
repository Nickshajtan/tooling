/** Stable error codes: documented in docs/cli.md and used as the `code` field of `--json` error events. */
export const ErrorCode = {
    UnknownCommand: 'unknown_command',
    UnknownFlag: 'unknown_flag',
    FlagNotForCommand: 'flag_not_for_command',
    BadFlagValue: 'bad_flag_value',
    MissingRequiredFlag: 'missing_required_flag',
    ConflictingFlags: 'conflicting_flags',
    ConfigFileUnreadable: 'config_file_unreadable',
    ConfigInvalid: 'config_invalid',
    PluginInvalid: 'plugin_invalid',
    PluginIncompatible: 'plugin_incompatible',
    UnknownPluginId: 'unknown_plugin_id',
    SourceFailed: 'source_failed',
    NoSitesSelected: 'no_sites_selected',
    RunNotFound: 'run_not_found',
    RunAlreadyExists: 'run_already_exists',
    RunSchemaUnsupported: 'run_schema_unsupported',
    ReporterFailed: 'reporter_failed',
    /** Not a user mistake: a bug in the tool or the engine. */
    Internal: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface Problem {
    /** What is wrong. */
    readonly what: string;
    /** The flag, config key path, file or plugin id it is about. */
    readonly where?: string;
    /** How to fix it. */
    readonly hint?: string;
    /** Closest valid value. */
    readonly didYouMean?: string;
}

/** A mistake the user can fix. Anything else that is thrown is an internal bug and is reported as one. */
export class CliError extends Error {
    constructor(
        readonly code: ErrorCode,
        readonly problems: readonly Problem[],
    ) {
        super(problems.map((problem) => problem.what).join('; '));
        this.name = 'CliError';
    }
}

/** A CliError with a single problem. */
export function cliError(code: ErrorCode, what: string, extra: Omit<Problem, 'what'> = {}): CliError {
    return new CliError(code, [{ what, ...extra }]);
}
