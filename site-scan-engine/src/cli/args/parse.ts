import { didYouMean } from '../../shared/did-you-mean.js';
import { CliError, ErrorCode, type Problem } from '../errors.js';
import { COERCERS } from './coercers.js';
import { FlagType, type CommandName, type FlagSpec } from './flag-spec.js';
import { FLAGS, FLAGS_BY_NAME } from './flags.js';
import { ParsedFlags } from './parsed-flags.js';

export interface ParsedArgs {
    readonly flags: ParsedFlags;
    readonly positionals: readonly string[];
}

interface CodedProblem {
    readonly code: ErrorCode;
    readonly problem: Problem;
}

const SHORTS: ReadonlyMap<string, FlagSpec> = new Map(FLAGS.flatMap((flag) => (flag.short ? [[flag.short, flag] as const] : [])));

interface RawFlag {
    readonly spec: FlagSpec;
    /** What the user typed, for messages: `--concurrency 5`. */
    readonly shown: string;
    readonly raw: string | null;
}

function display(spec: FlagSpec): string {
    return `--${spec.name}`;
}

/** Splits argv into flags and positionals. Unknown flags and flags missing a value are reported, not thrown. */
function tokenize(argv: readonly string[], command: CommandName, problems: CodedProblem[]): { raw: RawFlag[]; positionals: string[] } {
    const raw: RawFlag[] = [];
    const positionals: string[] = [];
    const valid = FLAGS.filter((flag) => flag.commands.includes(command)).map(display);

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index] ?? '';
        if (token === '--') {
            positionals.push(...argv.slice(index + 1));
            break;
        }
        const isLong = token.startsWith('--');
        const isShort = !isLong && /^-[a-zA-Z]$/.test(token);
        if (!isLong && !isShort) {
            positionals.push(token);
            continue;
        }

        const equals = isLong ? token.indexOf('=') : -1;
        const name = isLong ? token.slice(2, equals === -1 ? undefined : equals) : token.slice(1);
        const spec = isLong ? FLAGS_BY_NAME.get(name) : SHORTS.get(name);
        if (!spec) {
            const suggestion = didYouMean(`--${name}`, valid);
            problems.push({
                code: ErrorCode.UnknownFlag,
                problem: { what: 'Unknown flag.', where: token, ...(suggestion ? { didYouMean: suggestion } : {}) },
            });
            continue;
        }
        if (!spec.commands.includes(command)) {
            problems.push({
                code: ErrorCode.FlagNotForCommand,
                problem: { what: `${display(spec)} does not apply to "${command}".`, where: display(spec), hint: `It works with: ${spec.commands.join(', ')}.` },
            });
            if (spec.type !== FlagType.BOOLEAN && equals === -1) {
                index += 1;
            }
            continue;
        }
        if (spec.type === FlagType.BOOLEAN) {
            raw.push({ spec, shown: display(spec), raw: null });
            continue;
        }

        let value: string | null = equals === -1 ? null : token.slice(equals + 1);
        if (value === null) {
            const next = argv[index + 1];
            if (next !== undefined && !next.startsWith('--')) {
                value = next;
                index += 1;
            }
        }
        if (value === null) {
            problems.push({
                code: ErrorCode.BadFlagValue,
                problem: { what: 'Missing value.', where: display(spec), hint: `Usage: ${display(spec)} ${spec.value ?? '<value>'}${spec.example ? ` (example: ${spec.example})` : ''}` },
            });
            continue;
        }
        raw.push({ spec, shown: `${display(spec)} ${value}`, raw: value });
    }

    return { raw, positionals };
}

function coerceAll(raws: readonly RawFlag[], problems: CodedProblem[]): Map<string, unknown> {
    const values = new Map<string, unknown>();

    for (const { spec, shown, raw } of raws) {
        if (spec.type === FlagType.BOOLEAN) {
            values.set(spec.name, true);
            continue;
        }
        const result = COERCERS[spec.type].coerce(raw ?? '', spec);
        if ('problem' in result) {
            problems.push({
                code: ErrorCode.BadFlagValue,
                problem: {
                    what: `${result.problem}.`.replace(/\.\.$/, '.'),
                    where: shown,
                    ...(result.hint ? { hint: result.hint } : {}),
                    ...(result.didYouMean ? { didYouMean: result.didYouMean } : {}),
                },
            });
            continue;
        }
        if (spec.repeatable) {
            const existing = values.get(spec.name);
            values.set(spec.name, [...(Array.isArray(existing) ? existing : []), result.value]);
        } else if (values.has(spec.name)) {
            problems.push({ code: ErrorCode.BadFlagValue, problem: { what: 'Given more than once.', where: display(spec), hint: 'Only this flag can be repeated: ' + FLAGS.filter((f) => f.repeatable).map(display).join(', ') } });
        } else {
            values.set(spec.name, result.value);
        }
    }

    return values;
}

function relationProblems(values: ReadonlyMap<string, unknown>): CodedProblem[] {
    const problems: CodedProblem[] = [];

    for (const name of values.keys()) {
        const spec = FLAGS_BY_NAME.get(name);
        if (!spec) {
            continue;
        }
        for (const required of spec.requires ?? []) {
            if (!values.has(required)) {
                const other = FLAGS_BY_NAME.get(required);
                problems.push({
                    code: ErrorCode.MissingRequiredFlag,
                    problem: { what: `Requires --${required}.`, where: display(spec), ...(spec.example ? { hint: `Example: ${spec.example}` } : other?.example ? { hint: `Example: ${other.example}` } : {}) },
                });
            }
        }
        if (spec.requiresOneOf && !spec.requiresOneOf.some((other) => values.has(other))) {
            problems.push({
                code: ErrorCode.MissingRequiredFlag,
                problem: { what: `Requires ${spec.requiresOneOf.map((flag) => `--${flag}`).join(' or ')}.`, where: display(spec), ...(spec.example ? { hint: `Example: ${spec.example}` } : {}) },
            });
        }
        for (const conflict of spec.conflictsWith ?? []) {
            if (values.has(conflict) && name < conflict) {
                problems.push({ code: ErrorCode.ConflictingFlags, problem: { what: `Cannot be combined with --${conflict}.`, where: display(spec), hint: 'Pick one of the two.' } });
            }
        }
    }

    return problems;
}

/**
 * Parses and validates the flags of one command. All problems are collected and thrown together as one CliError,
 * so the user fixes the whole command line in one go. `--help` skips the cross-flag checks.
 */
export function parseArgs(argv: readonly string[], command: CommandName): ParsedArgs {
    const problems: CodedProblem[] = [];
    const { raw, positionals } = tokenize(argv, command, problems);
    const values = coerceAll(raw, problems);
    if (!values.has('help')) {
        problems.push(...relationProblems(values));
    }

    const [first] = problems;
    if (first) {
        throw new CliError(first.code, problems.map((entry) => entry.problem));
    }

    return { flags: new ParsedFlags(values), positionals };
}
