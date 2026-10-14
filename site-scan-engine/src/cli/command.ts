import type { ExitCode } from './exit-code.js';
import type { ParsedArgs } from './args/parse.js';
import type { CommandContext } from './options.js';

export { CommandName } from './args/flag-spec.js';

/** A CLI command. `commands/` decide what happens; `ui/` decides how it looks. */
export interface Command {
    readonly name: import('./args/flag-spec.js').CommandName;
    run(args: ParsedArgs, context: CommandContext): Promise<ExitCode>;
}
