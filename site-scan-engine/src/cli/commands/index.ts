import { CommandName, type Command } from '../command.js';
import { pluginsCommand } from './plugins.js';
import { reportCommand } from './report.js';
import { scanCommand } from './scan.js';
import { validateCommand } from './validate.js';

/** Dispatch table; `satisfies` makes a command without an entry a compile error. */
export const COMMANDS = {
    [CommandName.SCAN]: scanCommand,
    [CommandName.REPORT]: reportCommand,
    [CommandName.VALIDATE]: validateCommand,
    [CommandName.PLUGINS]: pluginsCommand,
} as const satisfies Record<CommandName, Command>;

export function findCommand(name: string): Command | undefined {
    return Object.values(COMMANDS).find((command) => command.name === name);
}
