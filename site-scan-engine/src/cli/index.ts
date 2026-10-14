/**
 * Shared CLI for scan tools — the glue layer and the only module that reads `process.*`.
 *
 *   argv → args/ (flag table: parse + validate)        → plan-run (config with origins, plugins, sites, store)
 *        → commands/ (what happens) → ui/ (how it looks) → exit code
 */

import { CommandName } from './args/flag-spec.js';
import { parseArgs } from './args/parse.js';
import { findCommand } from './commands/index.js';
import { cliError, ErrorCode } from './errors.js';
import { ExitCode } from './exit-code.js';
import { helpText } from './help.js';
import type { CommandContext, RunCliOptions } from './options.js';
import { createRegistry } from '../plugins/registry.js';
import { didYouMean } from '../shared/did-you-mean.js';
import { processSignals } from './signals.js';
import { createOutputMode } from './ui/modes/index.js';
import { resolveColor, Terminal } from './ui/terminal.js';
import { createTheme } from './ui/theme.js';
import { OutputLevel, type OutputMode } from './ui/views.js';

export { ExitCode };
export type { RunCliOptions, TextSink } from './options.js';

const HELP_WORDS: ReadonlySet<string> = new Set(['--help', '-h', 'help']);
const COMMAND_NAMES: readonly string[] = Object.values(CommandName);

/** The level the output flags select; they exclude each other (the parser already rejected a mix). */
function levelOf(argv: readonly string[]): OutputLevel {
    if (argv.includes('--json')) {
        return OutputLevel.JSON;
    }
    if (argv.includes('--quiet') || argv.includes('-q')) {
        return OutputLevel.QUIET;
    }

    return argv.includes('--verbose') || argv.includes('-v') ? OutputLevel.VERBOSE : OutputLevel.DEFAULT;
}

/** Runs the full CLI and returns the exit code (the caller's bin decides whether to exit). */
export async function runCli(options: RunCliOptions): Promise<ExitCode> {
    const {
        name,
        adapters,
        argv = process.argv.slice(2),
        stdout = process.stdout,
        stderr = process.stderr,
        env = process.env,
        now = () => new Date(),
        clock = () => performance.now(),
        cwd = process.cwd(),
        signals = processSignals,
    } = options;
    const adapterIds = adapters.map((a) => a.id);

    const terminal = new Terminal({ stdout, stderr, color: resolveColor(env, stderr.isTTY === true, argv.includes('--no-color')) });
    const mode: OutputMode = createOutputMode(levelOf(argv), { terminal, theme: createTheme(terminal.color), cwd, clock, now });
    let commandName: string | null = null;

    try {
        const [first, ...rest] = argv;
        if (!first || HELP_WORDS.has(first)) {
            mode.help(helpText(name, adapterIds));

            return ExitCode.OK;
        }
        commandName = first;
        const command = findCommand(first);
        if (!command) {
            const suggestion = didYouMean(first, COMMAND_NAMES);
            throw cliError(ErrorCode.UnknownCommand, 'Unknown command.', {
                where: first,
                hint: `Commands: ${COMMAND_NAMES.join(', ')}.`,
                ...(suggestion ? { didYouMean: suggestion } : {}),
            });
        }
        if (rest.includes('--help') || rest.includes('-h')) {
            mode.help(helpText(name, adapterIds, command.name));

            return ExitCode.OK;
        }

        const args = parseArgs(rest, command.name);
        const context: CommandContext = {
            name,
            version: options.version,
            adapters,
            registry: createRegistry({
                sources: options.sources ?? [],
                reporters: options.reporters ?? [],
                extensions: options.extensions ?? [],
                stores: options.stores ?? [],
            }),
            toolExtensions: options.extensions ?? [],
            toolConfig: options.config ?? {},
            mode,
            terminal,
            signals,
            now,
            clock,
            cwd,
        };
        const code = await command.run(args, context);
        mode.close();

        return code;
    } catch (err) {
        mode.error(err, { tool: name, command: commandName });
        mode.close();

        return ExitCode.ERROR;
    }
}
